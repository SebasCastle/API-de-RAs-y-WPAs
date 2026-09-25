import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoginResponse, LoginResult } from "../interface/login.interface";
import { UserResponse } from "../interface/user.interface";
import { SessionService } from "./session.service";
import {
  WandCredentialStore,
  WandCredentials,
} from "./wand-credential-store.service";
import { AxiosResponse } from "axios";

interface LoginOptions {
  username?: string;
  password?: string;
  force?: boolean;
}

@Injectable()
export class AuthService {
  private loginInFlight: Promise<LoginResult> | null = null;
  private readonly wandEndpointInicio: string;
  constructor(
    private readonly session: SessionService,
    private readonly credentialStore: WandCredentialStore,
    configService: ConfigService,
  ) {
    const endpoint = configService.get<string>("WAND_ENDPOINT_INICIO")?.trim();
    if (!endpoint) {
      throw new Error("WAND_ENDPOINT_INICIO no es una URL válida:");
    }

    this.wandEndpointInicio = endpoint;
  }

  async login(options: LoginOptions = {}): Promise<LoginResult> {
    if (!options.force && this.hasActiveSession()) {
      return {
        success: true,
        message: "Ya existe una sesión activa.",
        logged: true,
      };
    }

    const usesConfiguredCredentials = !options.username && !options.password;

    if (usesConfiguredCredentials && this.loginInFlight) {
      return this.loginInFlight;
    }

    const loginTask = this.performLogin(this.resolveCredentials(options));

    if (!usesConfiguredCredentials) {
      return loginTask;
    }

    this.loginInFlight = loginTask;

    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  async ensureLogin(): Promise<void> {
    if (this.hasActiveSession()) {
      return;
    }

    const result = await this.login({ force: true });

    if (!result.success) {
      throw new UnauthorizedException(result.message);
    }
  }

  private async performLogin(
    credentials: Pick<WandCredentials, "username" | "password">,
  ): Promise<LoginResult> {
    const client = this.session.getClient();

    this.session.clear();
    await client.get(this.wandEndpointInicio);

    const body = new URLSearchParams({
      "login-form-type": "pwd",
      username: credentials.username,
      PASSWORD: credentials.password,
    });

    const loginResponse = await client.post<LoginResponse>(
      "/pkmslogin.form",
      body.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!this.isSuccessfulLoginResponse(loginResponse)) {
      this.session.clear();

      return {
        success: false,
        message: "WAND rechazó el login o solicitó cambio de contraseña.",
        logged: false,
      };
    }

    await this.followLoginRedirects(loginResponse);
    await this.loadUserContext();
    await this.selectLocation();

    this.session.markLoggedIn();

    return {
      success: true,
      message: "Login iniciado correctamente. Esperando peticiones.",
      logged: true,
    };
  }

  private resolveCredentials(
    options: LoginOptions,
  ): Pick<WandCredentials, "username" | "password"> {
    const configuredCredentials = this.credentialStore.getCredentials();

    return {
      username: options.username ?? configuredCredentials.username,
      password: options.password ?? configuredCredentials.password,
    };
  }

  private hasActiveSession(): boolean {
    return (
      this.session.isLogged() &&
      Boolean(this.session.getAgentId()) &&
      !this.session.isSessionExpired()
    );
  }

  private isSuccessfulLoginResponse(
    response: AxiosResponse<LoginResponse>,
  ): boolean {
    return (
      response.data?.operation === "login_success" ||
      this.isWandRedirect(response)
    );
  }

  private isWandRedirect(response: AxiosResponse): boolean {
    if (response.status < 300 || response.status >= 400) {
      return false;
    }

    const location = this.getHeader(response, "location");

    if (!location) {
      return false;
    }

    const redirectUrl = new URL(location, this.session.getBaseUrl());

    return redirectUrl.origin === this.session.getBaseUrl();
  }

  private async followLoginRedirects(
    response: AxiosResponse,
    maxRedirects = 5,
  ): Promise<void> {
    let nextResponse = response;

    for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount++) {
      if (!this.isWandRedirect(nextResponse)) {
        return;
      }

      const location = this.getHeader(nextResponse, "location");

      if (!location) {
        return;
      }

      const redirectUrl = new URL(location, this.session.getBaseUrl());

      nextResponse = await this.session
        .getClient()
        .get(`${redirectUrl.pathname}${redirectUrl.search}`);
    }

    throw new Error("WAND excedió el límite de redirects durante login.");
  }

  private async loadUserContext(): Promise<void> {
    const userResponse = await this.session
      .getClient()
      .post<UserResponse>("/wand/user/userReq", {
        loc: null,
        res: null,
        lname: null,
        mnemonic: null,
      });

    if (!userResponse.data?.agentId) {
      this.session.clear();
      throw new Error("WAND no devolvió un agentId.");
    }

    this.session.setAgentId(userResponse.data.agentId);
  }

  private async selectLocation(): Promise<void> {
    const locationResponse = await this.session
      .getClient()
      .post("/wand/user/selectLocation", {
        stationMnemonic: this.session.getStation(),
      });

    if (locationResponse.status !== 200) {
      this.session.clear();
      throw new Error("No fue posible seleccionar la estación.");
    }
  }

  private getHeader(
    response: AxiosResponse,
    headerName: string,
  ): string | null {
    const headers = response.headers as Record<string, unknown>;
    const value = headers[headerName];

    return typeof value === "string" ? value : null;
  }
}
