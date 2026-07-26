export interface ClimateNormals {
  /** Long-term average annual precipitation, in millimetres. */
  avgAnnualRainfallMm: number;
  /** Long-term average annual air temperature at 2m, in degrees Celsius. */
  avgAnnualTemperatureC: number;
  /** Monthly precipitation totals (mm), index 0 = January … 11 = December. */
  monthlyRainfallMm: number[];
  /** Monthly mean temperature (°C), index 0 = January … 11 = December. */
  monthlyTemperatureC: number[];
  /** Attribution string for the data provider, e.g. "NASA POWER". */
  source: string;
}

export type ClimateFetchStatus = 'ok' | 'error';

export type ClimateFetchResult =
  | { status: 'ok'; normals: ClimateNormals }
  | { status: 'error'; error: string };
