import { Injectable, Logger } from "@nestjs/common";
/** Punto de integracion AWS/Lightsail/VM. Nunca ejecuta BAT ni procesos Windows. */
@Injectable()
export class WorkerActivationService {
  private readonly logger = new Logger(WorkerActivationService.name);
  async solicitarInicio(jobId: string) {
    this.logger.warn(
      `El job ${jobId} espera un worker. Configure un iniciador externo para modo bajo demanda.`,
    );
    return {
      requested: false,
      reason: "No hay iniciador de instancia configurado.",
      jobId,
    };
  }
}
