/* eslint-disable prettier/prettier */
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { WpaJob, WpaJobStatus } from "./entities/wpa-job.entity";
import { WPA } from "./entities/wpa.entity";
import { WpaWorker, WorkerStatus } from "./entities/wpa-worker.entity";
import { CreateWpaJobDto } from "./dto/create-wpa-job.dto";
import { WorkerHeartbeatDto } from "./dto/worker-heartbeat.dto";
import { WpaSyncPayload } from "./interfaces/wpa-result.interface";
import { WorkerActivationService } from "./worker-activation.service";

@Injectable()
export class WpasService {
  private readonly logger = new Logger(WpasService.name);

  constructor(
    @InjectModel(WPA.name) private readonly wpaModel: Model<WPA>,
    @InjectModel(WpaJob.name) private readonly jobModel: Model<WpaJob>,
    @InjectModel(WpaWorker.name) private readonly workerModel: Model<WpaWorker>,
    private readonly workerActivationService: WorkerActivationService,
  ) {}

  async crearJob( input: CreateWpaJobDto = {} ): Promise<{ job: WpaJob; activation: unknown }> {
    //creo el job en MongoDB
    const job = await this.jobModel.create({
      source: input.source || "FILE",
      reservations: input.reservations || [],
      status: WpaJobStatus.PENDING,
    });
    //revisar activacion de la instancia
    const activation = (await this.hayWorkerOnline())
      ? { requested: false, reason: "Un worker ya esta disponible." }
      : await this.workerActivationService.solicitarInicio(job.id);
    return { job, activation };
  }

  //endpoint que llama el worker de bluezone
  async reclamarSiguienteJob(workerId: string): Promise<WpaJob | null> {
    await this.registrarHeartbeat({ workerId, status: WorkerStatus.ONLINE });
    const job = await this.jobModel
      .findOneAndUpdate(
        { status: WpaJobStatus.PENDING },
        {
          $set: {
            status: WpaJobStatus.RUNNING,
            workerId,
            startedAt: new Date(),
          },
        },
        { new: true, sort: { createdAt: 1 } },
      )
      .exec();
    if (job)
      await this.registrarHeartbeat({
        workerId,
        status: WorkerStatus.BUSY,
        jobId: job.id,
      });
    return job;
  }
//revisar la ultima conexion de la instancia
  async registrarHeartbeat(input: WorkerHeartbeatDto): Promise<WpaWorker> {
    const worker = await this.workerModel
      .findOneAndUpdate(
        { workerId: input.workerId },
        {
          $set: {
            status: input.status || WorkerStatus.ONLINE,
            currentJobId: input.jobId || null,
            lastHeartbeatAt: new Date(),
            metadata: input.metadata || {},
          },
          $setOnInsert: { workerId: input.workerId },
        },
        { new: true, upsert: true },
      )
      .exec();
    if (!worker)
      throw new Error("No fue posible registrar el heartbeat del worker.");
    return worker;
  }

  
  async recibirResultados(
    jobId: string,
    payload: WpaSyncPayload,
  ): Promise<void> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new Error("El job WPA no existe.");
    for (const result of payload.results || []) {
      await this.wpaModel.findOneAndUpdate(
        { resNum: result.reservacion },
        {
          $set: {
            wpa: result.wpa || "",
            status: result.status || payload.status,
            message: payload.message || "",
            processedAt: new Date(),
          },
          $inc: { attempts: 1 },
        },
        { upsert: true, new: true },
      );
    }
    const completed = payload.status === "success";
    await this.jobModel.findByIdAndUpdate(jobId, {
      $set: {
        status: completed ? WpaJobStatus.COMPLETED : WpaJobStatus.ERROR,
        result: payload,
        finishedAt: new Date(),
      },
    });
    if (job.workerId)
      await this.registrarHeartbeat({
        workerId: job.workerId,
        status: WorkerStatus.ONLINE,
      });
    this.logger.log(
      `Job WPA ${jobId} finalizado con estado ${payload.status}.`,
    );
  }

  obtenerJob(jobId: string) {
    return this.jobModel.findById(jobId).exec();
  }
  obtenerResultados(jobId?: string) {
    return jobId
      ? this.jobModel.findById(jobId).exec()
      : this.jobModel
          .findOne({
            status: { $in: [WpaJobStatus.COMPLETED, WpaJobStatus.ERROR] },
          })
          .sort({ finishedAt: -1 })
          .exec();
  }
  obtenerWorkers() {
    return this.workerModel.find().sort({ lastHeartbeatAt: -1 }).exec();
  }

  async obtenerReservacionesDelJob(jobId: string): Promise<string[]> {
    const job = await this.jobModel.findById(jobId).exec();
    if (!job) throw new Error("El job WPA no existe.");
    return job.reservations || [];
  }

  private async hayWorkerOnline(): Promise<boolean> {
    return !!(await this.workerModel.exists({
      status: { $in: [WorkerStatus.ONLINE, WorkerStatus.BUSY] },
      lastHeartbeatAt: { $gte: new Date(Date.now() - 90_000) },
    }));
  }
}
