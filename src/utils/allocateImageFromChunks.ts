import { Chunk } from '@/src/core/streaming/chunk';
import { NameToMeta } from '@/src/core/dicomTags';
import { Maybe } from '@/src/types';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { Vector3 } from '@kitware/vtk.js/types';
import { mat3, vec3 } from 'gl-matrix';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { vtkWarningMacro } from '@kitware/vtk.js/macros';

function toVec(s: Maybe<string | string[]>): number[] | null {
  if (!s?.length) return null;
  const array = Array.isArray(s) ? s : s.split('\\');
  return array.map((a) => Number(a)) as number[];
}

function getBitStorageSize(num: number, signed: boolean) {
  const addSignedBit = signed ? 1 : 0;
  const val = num < 0 ? -num : num + 1; // range shift for log2
  const nbits = Math.ceil(Math.log2(val) + addSignedBit);
  // round up to a word size
  return 2 ** Math.ceil(Math.log2(nbits));
}

export function getTypedArrayForDataRange(min: number, max: number) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max))
    throw new Error('Input must be integers');

  const isSigned = min < 0;
  const nbits = getBitStorageSize(
    Math.abs(min) > Math.abs(max) ? min : max,
    isSigned
  );

  if (nbits <= 8) return isSigned ? Int8Array : Uint8Array;
  if (nbits <= 16) return isSigned ? Int16Array : Uint16Array;
  if (nbits <= 32) return isSigned ? Int32Array : Uint32Array;

  throw new Error(`Cannot handle ${nbits}-bit sized ranges`);
}

function getTypedArrayConstructor(
  bitsStored: number,
  pixelRepresentation: number,
  rescaleIntercept: number,
  rescaleSlope: number
) {
  if (bitsStored === 0) throw new Error('bits stored is zero!');

  // Maybe constrain bitsAllocated to allowed values of 8, 16, 32?
  const isSigned = pixelRepresentation === 1;
  const storedMin = isSigned ? -(2 ** (bitsStored - 1)) : 0;
  const storedMax = 2 ** (bitsStored - (isSigned ? 1 : 0)) - 1;
  const outputMin = Math.floor(storedMin * rescaleSlope + rescaleIntercept);
  const outputMax = Math.ceil(storedMax * rescaleSlope + rescaleIntercept);

  // NOTE(fli): might be better to assume (u)int16 and re-allocate to (u)int32
  // if needed, since the data range might actually fit in a smaller datatype.
  return getTypedArrayForDataRange(outputMin, outputMax);
}

export function allocateImageFromChunks(
  nameToMeta: NameToMeta,
  sortedChunks: Chunk[]
) {
  if (sortedChunks.length === 0) {
    throw new Error('Cannot allocate an image from zero chunks');
  }

  // use the first chunk as the source of metadata
  const meta = new Map(sortedChunks[0].metadata!);
  const imagePositionPatient = toVec(meta.get(nameToMeta.ImagePositionPatient));
  const imageOrientationPatient = toVec(
    meta.get(nameToMeta.ImageOrientationPatient)
  );
  const pixelSpacing = toVec(meta.get(nameToMeta.PixelSpacing));
  const rows = Number(meta.get(nameToMeta.Rows) ?? 0);
  const columns = Number(meta.get(nameToMeta.Columns) ?? 0);
  const bitsStored = Number(meta.get(nameToMeta.BitsStored) ?? 0);
  const pixelRepresentation = Number(meta.get(nameToMeta.PixelRepresentation));
  const samplesPerPixel = Number(meta.get(nameToMeta.SamplesPerPixel) ?? 1);
  const rescaleIntercept = Number(meta.get(nameToMeta.RescaleIntercept) ?? 0);
  const rescaleSlope = Number(meta.get(nameToMeta.RescaleSlope) ?? 1);
  const numberOfFrames = meta.has(nameToMeta.NumberOfFrames)
    ? Number(meta.get(nameToMeta.NumberOfFrames))
    : null;

  // If we have NumberOfFrames, chances are it's a multi-frame DICOM.
  if (numberOfFrames !== null && sortedChunks.length > 1) {
    vtkWarningMacro(
      'Found a multi-frame chunk in a group of chunks of size > 1'
    );
  }

  const slices = numberOfFrames === null ? sortedChunks.length : numberOfFrames;
  const TypedArrayCtor = getTypedArrayConstructor(
    bitsStored,
    pixelRepresentation,
    rescaleIntercept,
    rescaleSlope
  );
  const pixelData = new TypedArrayCtor(
    rows * columns * slices * samplesPerPixel
  );

  const image = vtkImageData.newInstance();
  image.setExtent([0, columns - 1, 0, rows - 1, 0, slices - 1]);

  if (imagePositionPatient) {
    image.setOrigin(imagePositionPatient as Vector3);
  }

  image.setSpacing([1, 1, 1]);
  if (slices > 1 && imagePositionPatient && pixelSpacing) {
    const lastMeta = new Map(sortedChunks[sortedChunks.length - 1].metadata);
    const lastIPP = toVec(lastMeta.get(nameToMeta.ImagePositionPatient));
    if (lastIPP) {
      // assumption: uniform Z spacing
      const zVec = vec3.create();
      const firstIPP = imagePositionPatient;
      vec3.sub(zVec, lastIPP as vec3, firstIPP as vec3);
      const zSpacing = vec3.len(zVec) / (sortedChunks.length - 1) || 1;
      const spacing = [...pixelSpacing, zSpacing];
      image.setSpacing(spacing);
    }
  }

  if (imageOrientationPatient) {
    const zDir = vec3.create() as Vector3;
    vec3.cross(
      zDir,
      imageOrientationPatient.slice(0, 3) as vec3,
      imageOrientationPatient.slice(3, 6) as vec3
    );
    image.setDirection([...imageOrientationPatient, ...zDir] as mat3);
  }

  const dataArray = vtkDataArray.newInstance({
    numberOfComponents: samplesPerPixel,
    values: pixelData,
  });
  image.getPointData().setScalars(dataArray);

  // TODO(fli) sane defaults?
  dataArray.setRange({ min: 0, max: 255 }, 0);

  return image;
}
