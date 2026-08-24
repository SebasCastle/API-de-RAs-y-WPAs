export interface LoginResult {
  success: boolean;
  message: string;
  logged: boolean;
}

export interface LoginResponse {
  operation: string;
  error?: boolean;
  message?: string;
}
