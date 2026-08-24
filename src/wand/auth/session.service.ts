import { Injectable } from "@nestjs/common";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { AuthService } from "./auth.service";

const WAND_BASE_URL = "https://wand-avis.prod.avisbudget.com";
const SESSION_TTL_MS = 20 * 60 * 1000;

@Injectable()
export class SessionService {
  private readonly client: AxiosInstance;
  private readonly cookies = new Map<string, string>();
  private logged = false;
  private lastLogin: Date | null = null;
  private station = "QU4";
  private agentId: string | null = null;
  private lastActivity: number | null = null;
  private readonly SESSION_TIMEOUT = 4 * 60 * 1000; // 4 minutos

  constructor() {
    this.client = axios.create({
      baseURL: WAND_BASE_URL,
      withCredentials: true,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });

    this.client.interceptors.request.use((config) => {
      const cookieHeader = this.getCookieHeader();

      if (cookieHeader) {
        config.headers.set("Cookie", cookieHeader);
      } else {
        config.headers.delete("Cookie");
      }

      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        this.updateResponseCookies(response);
        return response;
      },
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response) {
          this.updateResponseCookies(error.response);
        }

        return Promise.reject(
          error instanceof Error
            ? error
            : new Error("Error HTTP desconocido.", { cause: error }),
        );
      },
    );
  }

  //metodos

  getClient(): AxiosInstance {
    return this.client;
  }

  isLogged(): boolean {
    return this.logged;
  }

  markLoggedIn(): void {
    this.logged = true;
    this.lastLogin = new Date();
  }

  getLastLogin(): Date | null {
    return this.lastLogin;
  }

  isSessionExpired(): boolean {
    if (!this.lastLogin) {
      return true;
    }

    return Date.now() - this.lastLogin.getTime() > SESSION_TTL_MS;
  }

  getStation(): string {
    return this.station;
  }

  setStation(station: string): void {
    this.station = station;
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  setAgentId(agentId: string): void {
    this.agentId = agentId;
  }

  getCookies(): string[] {
    return [...this.cookies.entries()].map(
      ([name, value]) => `${name}=${value}`,
    );
  }

  async ensureSession(authService: AuthService) {
    if (this.isExpired()) {
      this.clear();
      await authService.login();
    }
    this.touch();
  }

  updateCookies(
    setCookieHeaders: string | readonly string[] | undefined,
  ): void {
    if (!setCookieHeaders) {
      return;
    }

    const headers: readonly string[] =
      typeof setCookieHeaders === "string"
        ? [setCookieHeaders]
        : setCookieHeaders;

    for (const rawCookie of headers) {
      const [nameValue, ...attributes] = rawCookie.split(";");
      const separator = nameValue.indexOf("=");

      if (separator <= 0) {
        continue;
      }

      const name = nameValue.slice(0, separator).trim();
      const value = nameValue.slice(separator + 1).trim();
      const shouldDelete = attributes.some(
        (attribute) => attribute.trim().toLowerCase() === "max-age=0",
      );

      if (shouldDelete) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  getCookieHeader(): string {
    return this.getCookies().join("; ");
  }

  clear(): void {
    this.logged = false;
    this.lastLogin = null;
    this.agentId = null;
    this.cookies.clear();
  }

  getSessionInfo() {
    return {
      logged: this.logged,
      station: this.station,
      agentId: this.agentId,
      lastLogin: this.lastLogin,
      cookies: this.cookies.size,
    };
  }

  // Actualiza la marca de tiempo de la última actividad
  touch() {
    this.lastActivity = Date.now();
  }

  isExpired(): boolean {
    if (!this.lastActivity) {
      return true;
    }

    return Date.now() - this.lastActivity > this.SESSION_TIMEOUT;
  }

  async logout() {
    try {
      await this.getClient().post("/pkmslogout?filename=wandlogout.html");
    } catch (error) {
      throw new Error("Error al cerrar sesión en WAND: " + error);
    } finally {
      this.clear();
    }
  }
  // Maneja las cookies de la respuesta HTTP y actualiza el estado de la sesión
  private updateResponseCookies(response: AxiosResponse): void {
    this.updateCookies(response.headers["set-cookie"]);
  }
}
