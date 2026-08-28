export interface WpaResult {
  reservacion: string;
  wpa: string;
  status: string;
}

export interface WpaSyncPayload {
  status: string;
  errorCode: number;
  message: string;

  stats: {
    total: number;
    correctos: number;
    noEncontrados: number;
    errores: number;
  };

  results: WpaResult[];
}
