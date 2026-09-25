/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createReadStream } from "fs";
import { CreateWpaJobDto } from "./dto/create-wpa-job.dto";
import { WorkerHeartbeatDto } from "./dto/worker-heartbeat.dto";
import { WorkerLogDto } from "./dto/worker-log.dto";
import { WorkerShutdownDto } from "./dto/worker-shutdown.dto";
import { WorkerFailureDto } from "./dto/worker-failure.dto";
import { WpasService } from "./wpas.service";
import type { WpaSyncPayload } from "./interfaces/wpa-result.interface";
import { WpaLogLevel } from "./entities/wpa-worker-log.entity";

@Controller("wpa")
export class WpaController {
  constructor(private readonly wpaService: WpasService) {}

  /** Cliente: crea un job HTTP o FILE. */
  @Post("jobs")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 1_000_000 },
    }),
  )
  async crearJob(
    @Body() input: CreateWpaJobDto,
    @UploadedFile()
    file?: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const { job, activation } = await this.wpaService.crearJob(input, file);
    return {
      status: "pending",
      jobId: job.id,
      source: job.source,
      activation,
    };
  }

  /** BAT: informa estado ONLINE/STARTING/RUNNING/COMPLETED/IDLE/ERROR. */
  @Post("worker/heartbeat")
  @HttpCode(200)
  heartbeat(@Body() input: WorkerHeartbeatDto) {
    return this.wpaService.registrarHeartbeat(input);
  }

  /** JS: reclama el siguiente job PENDING. 200 + null si no hay. */
  @Get("worker/jobs/next")
  siguienteJob(@Query("workerId") workerId: string) {
    return this.wpaService.reclamarSiguienteJob(workerId || "BLUEZONE-DEFAULT");
  }

  /** BAT: pregunta si hay jobs PENDING. Siempre 200 { pending: boolean }. */
  @Get("worker/jobs/pending")
  jobsPendientes(@Query("workerId") workerId?: string) {
    return this.wpaService.hayJobsPendientes(workerId);
  }

  /** BAT: espera jobStatus COMPLETED/ERROR del job, no el heartbeat del worker. */
  @Get("worker/status")
  @HttpCode(200)
  estadoWorker(@Query("workerId") workerId?: string) {
    return this.wpaService.obtenerEstadoWorker(workerId || "BLUEZONE-DEFAULT");
  }

  /** BAT: aviso de apagado de instancia (en pruebas no apaga). */
  @Post("worker/shutdown")
  @HttpCode(200)
  solicitarApagado(@Body() input: WorkerShutdownDto) {
    return this.wpaService.solicitarApagado(input);
  }

  /** BAT: error inesperado; marca el job y lo ve el cliente. */
  @Post("worker/failure")
  @HttpCode(200)
  registrarFallo(@Body() input: WorkerFailureDto) {
    return this.wpaService.registrarFalloWorker(input);
  }

  /** JS: reservaciones del job reclamado { source, reservations }. */
  @Get("jobs/:jobId/reservations")
  reservaciones(@Param("jobId") jobId: string) {
    return this.wpaService.obtenerReservacionesDelJob(jobId);
  }

  /** JS: envia WPAs y termina el job (success/error). */
  @Post("jobs/:jobId/sync")
  @HttpCode(200)
  async recibirResultados(
    @Param("jobId") jobId: string,
    @Body() payload: WpaSyncPayload,
  ) {
    await this.wpaService.recibirResultados(jobId, payload);
    return { ok: true, message: "Resultados recibidos correctamente." };
  }

  /** Cliente: estado crudo del job (502 si el script fallo). */
  @Get("jobs/:jobId")
  obtenerJob(@Param("jobId") jobId: string) {
    return this.wpaService.obtenerJob(jobId);
  }

  /** Cliente: WPAs del job, fecha, exito y worker. */
  @Get("results/:jobId")
  obtenerResultados(@Param("jobId") jobId: string) {
    return this.wpaService.obtenerResultadosPorJobId(jobId);
  }

  /** Operacion: lista de workers y ultimo heartbeat. */
  @Get("workers")
  obtenerWorkers() {
    return this.wpaService.obtenerWorkers();
  }

  /** BAT: descarga script.js, bzw2h.bzlp, Lanzador_Bluezone.bat. */
  @Get("worker/resources/:file")
  descargarRecurso(@Param("file") file: string) {
    const recurso = this.wpaService.resolverRecursoWorker(file);
    return new StreamableFile(createReadStream(recurso.path), {
      type: recurso.contentType,
      disposition: `attachment; filename="${recurso.downloadName}"`,
    });
  }

  /** BAT y JS: log local replicado en Nest. */
  @Post("worker/logs")
  @HttpCode(201)
  registrarLog(@Body() input: WorkerLogDto) {
    return this.wpaService.registrarLog(input);
  }

  /** Operacion: consulta logs persistidos. */
  @Get("worker/logs")
  obtenerLogs(
    @Query("limit") limit?: string,
    @Query("level") level?: WpaLogLevel,
  ) {
    const parsed = Number(limit);
    return this.wpaService.obtenerLogs(
      Number.isInteger(parsed) ? parsed : 100,
      level,
    );
  }
}
