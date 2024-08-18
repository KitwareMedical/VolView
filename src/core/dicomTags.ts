export const Tags = {
  SOPInstanceUID: '0008|0018',
  PatientName: '0010|0010',
  PatientID: '0010|0020',
  PatientBirthDate: '0010|0030',
  PatientSex: '0010|0040',
  StudyInstanceUID: '0020|000d',
  StudyDate: '0008|0020',
  StudyTime: '0008|0030',
  StudyID: '0020|0010',
  AccessionNumber: '0008|0050',
  StudyDescription: '0008|1030',
  Modality: '0008|0060',
  SeriesInstanceUID: '0020|000e',
  SeriesNumber: '0020|0011',
  SeriesDescription: '0008|103e',
  WindowLevel: '0028|1050',
  WindowWidth: '0028|1051',
  Rows: '0028|0010',
  Columns: '0028|0011',
  BitsAllocated: '0028|0100',
  BitsStored: '0028|0101',
  PixelRepresentation: '0028|0103',
  ImagePositionPatient: '0020|0032',
  ImageOrientationPatient: '0020|0037',
  PixelSpacing: '0028|0030',
  SamplesPerPixel: '0028|0002',
  RescaleIntercept: '0028|1052',
  RescaleSlope: '0028|1053',
  NumberOfFrames: '0028|0008',
} as const;

export type NameToMeta = {
  [key in keyof typeof Tags]: string;
};