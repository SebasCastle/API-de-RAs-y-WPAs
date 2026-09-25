import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "child_process";
import { dirname } from "path";
import { AwsService } from "./aws/aws-service";

@Injectable()
export class WorkerActivationService {
  private readonly logger = new Logger(WorkerActivationService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly awsService: AwsService,
  ) {}

  async solicitarInicio(jobId: string) {
    const mode = this.config.get<string>("WPAS_ACTIVATION_MODE", "LOCAL");

    this.logger.log(`Solicitando worker para job ${jobId} - modo: ${mode}`);

    if (mode === "LOCAL") {
      return this.iniciarLocal(jobId);
    }

    if (mode === "AWS") {
      return this.iniciarAWS(jobId);
    }

    throw new BadRequestException(`Modo de activación no soportado: ${mode}`);
  }

  awsAutoShutdownHabilitado(): boolean {
    return this.config.get<string>("WPAS_AWS_AUTO_SHUTDOWN", "0") === "1";
  }

  async solicitarApagadoAws(workerId: string) {
    this.logger.log(`Solicitando apagado AWS para worker ${workerId}`);

    const resultado = await this.awsService.apagarInstancia();

    return {
      ...resultado,
      workerId,
    };
  }

  private iniciarLocal(jobId: string) {
    const batPath = this.config.get<string>("BLUEZONE_BAT_PATH");

    if (!batPath) {
      throw new Error("BLUEZONE_BAT_PATH no está configurado.");
    }

    this.logger.log(`Iniciando worker local para job ${jobId}`);

    const proceso = spawn("cmd.exe", ["/c", batPath], {
      cwd: dirname(batPath),
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    proceso.unref();

    return {
      requested: true,
      mode: "LOCAL",
      jobId,
    };
  }

  private async iniciarAWS(jobId: string) {
    const resultado = await this.awsService.iniciarInstancia();

    return {
      ...resultado,
      mode: "AWS",
      jobId,
    };
  }
}
