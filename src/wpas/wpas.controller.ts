/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CreateWpaJobDto } from "./dto/create-wpa-job.dto";
import { WorkerHeartbeatDto } from "./dto/worker-heartbeat.dto";
import { WpasService } from "./wpas.service";
import type { WpaSyncPayload } from "./interfaces/wpa-result.interface";

@Controller("wpa")
export class WpaController {
  constructor(private readonly wpaService: WpasService) {}

  @Get()
  async iniciarWpa(@Query("source") source?: "FILE" | "HTTP") {
    const { job, activation } = await this.wpaService.crearJob({ source });
    return { status: "pending", jobId: job.id, source: job.source, activation };
  }

  // /** Compatibilidad con la URL que antes ejecutaba el BAT. */
  // @Get("Avis_bot") iniciarWpaLegado() {
  //   return this.iniciarWpa();
  // }

  @Post("jobs")
  async crearJob(@Body() input: CreateWpaJobDto) {
    const { job, activation } = await this.wpaService.crearJob(input);
    return { 
      status: "pending", 
      jobId: job.id,
      source: job.source, 
      activation
    };
  }

  //ver el ultimo estsuts de la instancia
  @Post("worker/heartbeat")
  @HttpCode(200)
  heartbeat(@Body() input: WorkerHeartbeatDto) {
    return this.wpaService.registrarHeartbeat(input);
  }

  @Get("worker/jobs/next")
  siguienteJob(@Query("workerId") workerId: string) {
    return this.wpaService.reclamarSiguienteJob(workerId || "BLUEZONE-DEFAULT");
  }

  @Get("jobs/:jobId/reservations")
  async reservaciones(@Param("jobId") jobId: string) {
    return {
      reservaciones: await this.wpaService.obtenerReservacionesDelJob(jobId),
    };
  }

  @Post("jobs/:jobId/sync")
  @HttpCode(200)
  async recibirResultados( @Param("jobId") jobId: string, @Body() payload: WpaSyncPayload ) {
    await this.wpaService.recibirResultados(jobId, payload);
    return { ok: true, message: "Resultados recibidos correctamente." };
  }

//consultar el avance del trabajo
  @Get("jobs/:jobId") obtenerJob(@Param("jobId") jobId: string) {
    return this.wpaService.obtenerJob(jobId);
  }

  //devuelve el estatus del job en especifico o el ultimo job
  @Get("results") obtenerResultados(@Query("jobId") jobId?: string) {
    return this.wpaService.obtenerResultados(jobId);
  }

  //revisar instancias en AWS
  @Get("workers") obtenerWorkers() {
    return this.wpaService.obtenerWorkers();
  }
}
