import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as fs } from "fs";
import { join } from "path";

export interface WandCredentials {
  username: string;
  password: string;
  lastPasswordChangedAt: Date | null;
}

const WAND_USER_KEY = "WAND_USER";
const WAND_PASSWORD_KEY = "WAND_PASSWORD";
const WAND_PASSWORD_CHANGED_AT_KEY = "WAND_PASSWORD_LAST_CHANGED_AT";

@Injectable()
export class WandCredentialStore {
  private readonly envPath = join(process.cwd(), ".env");

  constructor(private readonly configService: ConfigService) {}

  getCredentials(): WandCredentials {
    const username = this.configService.get<string>(WAND_USER_KEY);
    const password = this.configService.get<string>(WAND_PASSWORD_KEY);

    if (!username || !password) {
      throw new Error("Faltan WAND_USER o WAND_PASSWORD en la configuración.");
    }

    return {
      username,
      password,
      lastPasswordChangedAt: this.getLastPasswordChangedAt(),
    };
  }

  getLastPasswordChangedAt(): Date | null {
    const rawDate = this.configService.get<string>(
      WAND_PASSWORD_CHANGED_AT_KEY,
    );

    if (!rawDate) {
      return null;
    }

    const parsedDate = new Date(rawDate);

    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return parsedDate;
  }

  async savePasswordRotation(
    newPassword: string,
    changedAt = new Date(),
  ): Promise<void> {
    const updates = new Map<string, string>([
      [WAND_PASSWORD_KEY, newPassword],
      [WAND_PASSWORD_CHANGED_AT_KEY, changedAt.toISOString()],
    ]);
    const nextEnv = this.upsertEnvValues(await this.readEnvFile(), updates);

    await fs.writeFile(this.envPath, nextEnv, "utf8");

    process.env[WAND_PASSWORD_KEY] = newPassword;
    process.env[WAND_PASSWORD_CHANGED_AT_KEY] = changedAt.toISOString();
  }

  private async readEnvFile(): Promise<string> {
    try {
      return await fs.readFile(this.envPath, "utf8");
    } catch (error) {
      if (this.isFileNotFound(error)) {
        return "";
      }

      throw error;
    }
  }

  private upsertEnvValues(
    envContent: string,
    updates: Map<string, string>,
  ): string {
    const lines = envContent ? envContent.split(/\r?\n/) : [];
    const seenKeys = new Set<string>();
    const updatedLines = lines.map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);

      if (!match) {
        return line;
      }

      const key = match[1];

      if (!updates.has(key)) {
        return line;
      }

      seenKeys.add(key);

      return `${key}=${this.formatEnvValue(updates.get(key) ?? "")}`;
    });

    for (const [key, value] of updates) {
      if (!seenKeys.has(key)) {
        updatedLines.push(`${key}=${this.formatEnvValue(value)}`);
      }
    }

    return `${updatedLines.join("\n").replace(/\n*$/, "")}\n`;
  }

  private formatEnvValue(value: string): string {
    if (/^[A-Za-z0-9_./:@+-]*$/.test(value)) {
      return value;
    }

    return JSON.stringify(value);
  }

  private isFileNotFound(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    );
  }
}
