import { Injectable } from "@nestjs/common";
import { AxiosResponse } from "axios";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import {
  WandCredentialStore,
  WandCredentials,
} from "./wand-credential-store.service";

export interface PasswordRotationResult {
  rotated: boolean;
  skipped: boolean;
  reason: string;
  checkedAt: string;
  lastPasswordChangedAt: string | null;
  nextPasswordChangedAt: string | null;
}

interface RotateOptions {
  force?: boolean;
}

const CHANGE_PASSWORD_PATH = "/tim/selfserv/selfchangepwd.jsp";
const CHANGE_PASSWORD_POST_PATH = "/tim/selfserv/ChangePasswordServlet";
const ROTATION_INTERVAL_MONTHS = 3;

@Injectable()
export class WandPasswordRotationService {
  private rotationInFlight: Promise<PasswordRotationResult> | null = null;

  constructor(
    private readonly session: SessionService,
    private readonly authService: AuthService,
    private readonly credentialStore: WandCredentialStore,
  ) {}

  async rotateIfDue(
    options: RotateOptions = {},
  ): Promise<PasswordRotationResult> {
    if (this.rotationInFlight) {
      return this.rotationInFlight;
    }

    this.rotationInFlight = this.performRotation(options);

    try {
      return await this.rotationInFlight;
    } finally {
      this.rotationInFlight = null;
    }
  }

  getRotationStatus(now = new Date()): PasswordRotationResult {
    const credentials = this.credentialStore.getCredentials();
    const due = this.isRotationDue(credentials.lastPasswordChangedAt, now);

    return {
      rotated: false,
      skipped: true,
      reason: due
        ? "La contraseña WAND está vencida o no tiene fecha registrada."
        : "La contraseña WAND todavía no requiere rotación.",
      checkedAt: now.toISOString(),
      lastPasswordChangedAt:
        credentials.lastPasswordChangedAt?.toISOString() ?? null,
      nextPasswordChangedAt: credentials.lastPasswordChangedAt
        ? this.addMonths(
            credentials.lastPasswordChangedAt,
            ROTATION_INTERVAL_MONTHS,
          ).toISOString()
        : null,
    };
  }

  nextPassword(currentPassword: string): string {
    if (!currentPassword) {
      throw new Error("La contraseña WAND configurada está vacía.");
    }

    const lastCharacter = currentPassword.at(-1);

    if (!lastCharacter || !/[A-Za-z]/.test(lastCharacter)) {
      throw new Error(
        "La contraseña WAND debe terminar con una letra para poder rotarla.",
      );
    }

    return `${currentPassword.slice(0, -1)}${this.nextAlphabetCharacter(
      lastCharacter,
    )}`;
  }

  isRotationDue(lastChangedAt: Date | null, now = new Date()): boolean {
    if (!lastChangedAt) {
      return true;
    }

    return (
      now.getTime() >=
      this.addMonths(lastChangedAt, ROTATION_INTERVAL_MONTHS).getTime()
    );
  }

  private async performRotation(
    options: RotateOptions,
  ): Promise<PasswordRotationResult> {
    const checkedAt = new Date();
    const credentials = this.credentialStore.getCredentials();

    if (
      !options.force &&
      !this.isRotationDue(credentials.lastPasswordChangedAt, checkedAt)
    ) {
      return {
        rotated: false,
        skipped: true,
        reason: "La contraseña WAND todavía no requiere rotación.",
        checkedAt: checkedAt.toISOString(),
        lastPasswordChangedAt:
          credentials.lastPasswordChangedAt?.toISOString() ?? null,
        nextPasswordChangedAt: credentials.lastPasswordChangedAt
          ? this.addMonths(
              credentials.lastPasswordChangedAt,
              ROTATION_INTERVAL_MONTHS,
            ).toISOString()
          : null,
      };
    }

    const newPassword = this.nextPassword(credentials.password);

    await this.submitPasswordChange(credentials, newPassword);

    this.session.clear();
    const verificationLogin = await this.authService.login({
      username: credentials.username,
      password: newPassword,
      force: true,
    });

    if (!verificationLogin.success) {
      this.session.clear();
      throw new Error(
        "WAND cambió de estado, pero el login con la nueva contraseña no fue exitoso. No se guardaron credenciales.",
      );
    }

    await this.credentialStore.savePasswordRotation(newPassword, checkedAt);

    return {
      rotated: true,
      skipped: false,
      reason:
        "Contraseña WAND rotada y validada con login real. Credenciales actualizadas.",
      checkedAt: checkedAt.toISOString(),
      lastPasswordChangedAt: checkedAt.toISOString(),
      nextPasswordChangedAt: this.addMonths(
        checkedAt,
        ROTATION_INTERVAL_MONTHS,
      ).toISOString(),
    };
  }

  private async submitPasswordChange(
    credentials: WandCredentials,
    newPassword: string,
  ): Promise<void> {
    const client = this.session.getClient();

    this.session.clear();

    await client.get("/wand/wandui/app/wand/checkout");

    const loginBody = new URLSearchParams({
      "login-form-type": "pwd",
      username: credentials.username,
      PASSWORD: credentials.password,
    });

    const loginResponse = await client.post(
      "/pkmslogin.form",
      loginBody.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    await this.followWandRedirects(loginResponse);

    const changePage = await client.get<string>(CHANGE_PASSWORD_PATH, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    this.validateChangePasswordPage(changePage);

    const changeBody = new URLSearchParams({
      action: "useSelfPasswordManager",
      "login-form-type": "pwd",
      logonID: credentials.username,
      currentPassword: credentials.password,
      newPassword,
      confirmNewPassword: newPassword,
    });

    const changeResponse = await client.post<string>(
      CHANGE_PASSWORD_POST_PATH,
      changeBody.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: this.session.getBaseUrl(),
          Referer: `${this.session.getBaseUrl()}${CHANGE_PASSWORD_PATH}`,
        },
      },
    );

    const finalChangeResponse = await this.followWandRedirects(changeResponse);
    this.validatePasswordChangeResponse(finalChangeResponse);
  }

  private validateChangePasswordPage(response: AxiosResponse<string>): void {
    if (response.status !== 200) {
      throw new Error("WAND no abrió la pantalla de cambio de contraseña.");
    }

    const html = String(response.data ?? "");
    const requiredFields = [
      "logonID",
      "currentPassword",
      "newPassword",
      "confirmNewPassword",
    ];
    const missingField = requiredFields.find(
      (field) =>
        !html.includes(`name="${field}"`) && !html.includes(`name=${field}`),
    );

    if (missingField) {
      throw new Error(
        `La pantalla de cambio WAND no contiene el campo esperado: ${missingField}.`,
      );
    }
  }

  private validatePasswordChangeResponse(response: AxiosResponse): void {
    if (response.status < 200 || response.status >= 400) {
      throw new Error("WAND rechazó el cambio de contraseña por HTTP status.");
    }

    const responseText = String(response.data ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const hasErrorMessage =
      /\b(error|invalid|incorrect|failed|failure|unable|cannot|denied)\b/.test(
        responseText,
      ) ||
      responseText.includes("current password") ||
      responseText.includes("confirm new password");

    if (hasErrorMessage) {
      throw new Error(
        "WAND devolvió un mensaje de error en el cambio de contraseña. No se guardaron credenciales.",
      );
    }
  }

  private async followWandRedirects(
    response: AxiosResponse,
    maxRedirects = 5,
  ): Promise<AxiosResponse> {
    let nextResponse = response;

    for (let redirectCount = 0; redirectCount < maxRedirects; redirectCount++) {
      if (!this.isWandRedirect(nextResponse)) {
        return nextResponse;
      }

      const location = this.getHeader(nextResponse, "location");

      if (!location) {
        return nextResponse;
      }

      const redirectUrl = new URL(location, this.session.getBaseUrl());

      nextResponse = await this.session
        .getClient()
        .get(`${redirectUrl.pathname}${redirectUrl.search}`);
    }

    throw new Error("WAND excedió el límite de redirects.");
  }

  private isWandRedirect(response: AxiosResponse): boolean {
    if (response.status < 300 || response.status >= 400) {
      return false;
    }

    const location = this.getHeader(response, "location");

    if (!location) {
      return false;
    }

    return (
      new URL(location, this.session.getBaseUrl()).origin ===
      this.session.getBaseUrl()
    );
  }

  private getHeader(
    response: AxiosResponse,
    headerName: string,
  ): string | null {
    const headers = response.headers as Record<string, unknown>;
    const value = headers[headerName];

    return typeof value === "string" ? value : null;
  }

  private nextAlphabetCharacter(character: string): string {
    if (character >= "a" && character <= "y") {
      return String.fromCharCode(character.charCodeAt(0) + 1);
    }

    if (character === "z") {
      return "a";
    }

    if (character >= "A" && character <= "Y") {
      return String.fromCharCode(character.charCodeAt(0) + 1);
    }

    return "A";
  }

  private addMonths(date: Date, months: number): Date {
    const nextDate = new Date(date.getTime());
    const originalDay = nextDate.getDate();

    nextDate.setDate(1);
    nextDate.setMonth(nextDate.getMonth() + months);

    const lastDayOfTargetMonth = new Date(
      nextDate.getFullYear(),
      nextDate.getMonth() + 1,
      0,
    ).getDate();

    nextDate.setDate(Math.min(originalDay, lastDayOfTargetMonth));

    return nextDate;
  }
}
