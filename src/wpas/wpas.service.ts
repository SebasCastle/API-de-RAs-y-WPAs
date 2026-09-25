import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { existsSync } from "fs";
import { join } from "path";
import { DataSource, In, MoreThanOrEqual, Repository } from "typeorm";
import { CreateWpaJobDto } from "./dto/create-wpa-job.dto";
import { WpaJob, WpaJobStatus } from "./entities/wpa-job.entity";
import { WPA } from "./entities/wpa.entity";
import { WpaWorker, WorkerStatus } from "./entities/wpa-worker.entity";
import { WpaLogLevel, WpaWorkerLog } from "./entities/wpa-worker-log.entity";
import { WpaSyncPayload } from "./interfaces/wpa-result.interface";
import { WorkerHeartbeatDto } from "./dto/worker-heartbeat.dto";
import { WorkerLogDto } from "./dto/worker-log.dto";
import { WorkerShutdownDto } from "./dto/worker-shutdown.dto";
import { WorkerFailureDto } from "./dto/worker-failure.dto";
import { WorkerActivationService } from "./worker-activation.service";
import {
  parseReservationFile,
  validateReservations,
} from "./reservation-format";

export type UploadedReservationFile = {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
};

/** Logica WPA usando MySQL mediante TypeORM. */
@Injectable()
export class WpasService {
  private readonly logger = new Logger(WpasService.name);

  constructor(
    @InjectRepository(WPA) private readonly wpaRepository: Repository<WPA>,
    @InjectRepository(WpaJob)
    private readonly jobRepository: Repository<WpaJob>,
    @InjectRepository(WpaWorker)
    private readonly workerRepository: Repository<WpaWorker>,
    @InjectRepository(WpaWorkerLog)
    private readonly logRepository: Repository<WpaWorkerLog>,
    private readonly dataSource: DataSource,
    private readonly workerActivationService: WorkerActivationService,
  ) {}

  private readonly recursosWorker: Record<
    string,
    { file: string; downloadName: string; contentType: string }
  > = {
    "script.js": {
      file: "Script_Bluezone_a_Web (server)_AWS.js",
      downloadName: "Script_Bluezone_a_Web.js",
      contentType: "application/javascript; charset=utf-8",
    },
    "Script_Bluezone_a_Web (server)_AWS.js": {
      file: "Script_Bluezone_a_Web (server)_AWS.js",
      downloadName: "Script_Bluezone_a_Web.js",
      contentType: "application/javascript; charset=utf-8",
    },
    "Lanzador_Bluezone.bat": {
      file: "Lanzador_Bluezone.bat",
      downloadName: "Lanzador_Bluezone.bat",
      contentType: "application/octet-stream",
    },
    "bzw2h.bzlp": {
      file: "bzw2h.bzlp",
      downloadName: "bzw2h.bzlp",
      contentType: "application/octet-stream",
    },
    "config.env": {
      file: "config.env",
      downloadName: "config.env",
      contentType: "text/plain; charset=utf-8",
    },
    ".env": {
      file: "config.env",
      downloadName: "config.env",
      contentType: "text/plain; charset=utf-8",
    },
  };

  async crearJob(
    input: CreateWpaJobDto = {},
    file?: UploadedReservationFile,
  ): Promise<{ job: WpaJob; activation: unknown }> {
    const { source, reservations } = this.resolverOrigenYReservaciones(
      input,
      file,
    );

    const job = await this.jobRepository.save(
      this.jobRepository.create({
        source,
        reservations,
        status: WpaJobStatus.PENDING,
      }),
    );

    const activation = (await this.hayWorkerOnline())
      ? { requested: false, reason: "Un worker ya esta disponible." }
      : await this.workerActivationService.solicitarInicio(String(job.id));
    return { job, activation };
  }

  /** Reclama un job dentro de una transaccion para que dos workers no obtengan el mismo. */
  async reclamarSiguienteJob(workerId: string): Promise<WpaJob | null> {
    const job = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(WpaJob);
      const pending = await repository
        .createQueryBuilder("job")
        .setLock("pessimistic_write")
        .where("job.status = :status", { status: WpaJobStatus.PENDING })
        .orderBy("job.created_at", "ASC")
        .getOne();
      if (!pending) return null;
      pending.status = WpaJobStatus.RUNNING;
      pending.workerId = workerId;
      pending.startedAt = new Date();
      return repository.save(pending);
    });

    if (!job) return null;

    await this.registrarHeartbeat({
      workerId,
      status: WorkerStatus.BUSY,
      jobId: String(job.id),
    });
    return job;
  }

  async registrarHeartbeat(input: WorkerHeartbeatDto): Promise<WpaWorker> {
    let worker = await this.workerRepository.findOneBy({
      workerId: input.workerId,
    });
    if (!worker) {
      worker = this.workerRepository.create({
        workerId: input.workerId,
        metadata: {},
      });
    }
    worker.status = input.status || worker.status || WorkerStatus.ONLINE;
    if (input.jobId !== undefined) worker.currentJobId = input.jobId || null;
    worker.lastHeartbeatAt = new Date();
    if (input.metadata) worker.metadata = input.metadata;
    if (!worker.metadata) worker.metadata = {};
    return this.workerRepository.save(worker);
  }

  async recibirResultados(
    jobId: string,
    payload: WpaSyncPayload,
  ): Promise<void> {
    const id = this.toJobId(jobId);
    const job = await this.jobRepository.findOneBy({ id });
    if (!job) throw new NotFoundException("El job WPA no existe.");

    await this.dataSource.transaction(async (manager) => {
      const wpaRepository = manager.getRepository(WPA);
      for (const result of payload.results || []) {
        let wpa = await wpaRepository.findOneBy({ resNum: result.reservacion });
        if (!wpa)
          wpa = wpaRepository.create({
            resNum: result.reservacion,
            attempts: 0,
          });
        wpa.wpa = result.wpa || "";
        wpa.status = result.status || payload.status;
        wpa.message = payload.message || "";
        wpa.processedAt = new Date();
        wpa.attempts += 1;
        await wpaRepository.save(wpa);
      }

      const jobRepository = manager.getRepository(WpaJob);
      job.status =
        payload.status === "success"
          ? WpaJobStatus.COMPLETED
          : WpaJobStatus.ERROR;
      job.result = payload;
      job.finishedAt = new Date();
      await jobRepository.save(job);
    });

    if (job.workerId)
      await this.registrarHeartbeat({
        workerId: job.workerId,
        status:
          payload.status === "success"
            ? WorkerStatus.COMPLETED
            : WorkerStatus.ERROR,
        jobId: String(job.id),
      });
    this.logger.log(
      `Job WPA ${jobId} finalizado con estado ${payload.status}.`,
    );
  }

  async registrarFalloWorker(input: WorkerFailureDto) {
    await this.registrarLog({
      source: "Lanzador_Bluezone.bat",
      level: WpaLogLevel.ERROR,
      message: input.message,
      workerId: input.workerId,
      jobId: input.jobId,
      host: input.metadata?.host,
      metadata: {
        step: input.step || "",
        ...(input.metadata || {}),
      },
    });

    const job = await this.encontrarJobParaFallo(input.workerId, input.jobId);
    const payload: WpaSyncPayload = {
      status: "error",
      errorCode: 999,
      message: input.message,
      stats: {
        total: 0,
        correctos: 0,
        noEncontrados: 0,
        errores: 1,
      },
      results: [],
    };

    if (job) {
      job.status = WpaJobStatus.ERROR;
      job.result = {
        ...payload,
        source: "Lanzador_Bluezone.bat",
        step: input.step || "",
        workerId: input.workerId,
      };
      job.finishedAt = new Date();
      job.workerId = input.workerId;
      await this.jobRepository.save(job);
    }

    await this.registrarHeartbeat({
      workerId: input.workerId,
      status: WorkerStatus.ERROR,
      jobId: job ? String(job.id) : input.jobId,
      metadata: {
        reason: input.message,
        step: input.step || "",
      },
    });

    return {
      ok: true,
      jobId: job?.id || null,
      status: WorkerStatus.ERROR,
      message: input.message,
    };
  }

  private async encontrarJobParaFallo(workerId: string, jobId?: string) {
    if (jobId) {
      const byId = await this.jobRepository.findOneBy({
        id: this.toJobId(jobId),
      });
      if (byId) return byId;
    }

    const running = await this.jobRepository.findOne({
      where: { workerId, status: WpaJobStatus.RUNNING },
      order: { startedAt: "DESC" },
    });
    if (running) return running;

    return this.jobRepository.findOne({
      where: { status: WpaJobStatus.PENDING },
      order: { createdAt: "ASC" },
    });
  }

  async obtenerJob(jobId: string) {
    const job = await this.jobRepository.findOneBy({ id: this.toJobId(jobId) });
    if (!job) throw new NotFoundException("El job WPA no existe.");
    return this.exponerJobAlCliente(job);
  }

  async obtenerResultados(jobId?: string) {
    const job = jobId
      ? await this.jobRepository.findOneBy({ id: this.toJobId(jobId) })
      : await this.jobRepository.findOne({
          where: { status: In([WpaJobStatus.COMPLETED, WpaJobStatus.ERROR]) },
          order: { finishedAt: "DESC" },
        });
    if (!job) {
      throw new BadRequestException("no existen reservaciones a procesar");
    }
    return this.exponerJobAlCliente(job);
  }

  async obtenerResultadosPorJobId(jobId: string) {
    const job = await this.jobRepository.findOneBy({ id: this.toJobId(jobId) });
    if (!job) throw new NotFoundException("El job WPA no existe.");

    const wpas: Record<string, string | number> = {};
    const payload = (job.result || {}) as WpaSyncPayload;

    for (const result of payload.results || []) {
      if (!result?.reservacion) continue;
      wpas[result.reservacion] = this.normalizarWpa(result.wpa);
    }

    for (const reservation of job.reservations || []) {
      if (reservation in wpas) continue;
      const row = await this.wpaRepository.findOneBy({ resNum: reservation });
      wpas[reservation] = this.normalizarWpa(row?.wpa);
    }

    const key = `job_${job.id}`;
    return {
      [key]: {
        ...wpas,
        finishedAt: job.finishedAt,
        success: job.status === WpaJobStatus.COMPLETED,
        processedBy: job.workerId || null,
      },
    };
  }

  obtenerWorkers() {
    return this.workerRepository.find({ order: { lastHeartbeatAt: "DESC" } });
  }

  async hayJobsPendientes(workerId?: string): Promise<{
    pending: boolean;
    count: number;
    workerId: string;
  }> {
    try {
      const count = await this.jobRepository.count({
        where: { status: WpaJobStatus.PENDING },
      });
      return {
        pending: count > 0,
        count,
        workerId: workerId || "",
      };
    } catch (error) {
      this.logger.error("hayJobsPendientes fallo", error as Error);
      return { pending: false, count: 0, workerId: workerId || "" };
    }
  }

  async obtenerEstadoWorker(workerId: string): Promise<{
    workerId: string;
    status: string;
    jobStatus: string;
    jobId: string | null;
    pending: boolean;
  }> {
    try {
      const worker = await this.workerRepository.findOneBy({ workerId });
      const pendingCount = await this.jobRepository.count({
        where: { status: WpaJobStatus.PENDING },
      });

      const runningJob = await this.jobRepository.findOne({
        where: { workerId, status: WpaJobStatus.RUNNING },
        order: { startedAt: "DESC" },
      });

      let jobStatus = "NONE";
      let jobId = worker?.currentJobId || null;

      if (runningJob) {
        jobStatus = "RUNNING";
        jobId = String(runningJob.id);
      } else {
        const finishedJob = await this.jobRepository.findOne({
          where: {
            workerId,
            status: In([WpaJobStatus.COMPLETED, WpaJobStatus.ERROR]),
          },
          order: { finishedAt: "DESC" },
        });
        if (finishedJob?.finishedAt) {
          const ageMs = Date.now() - new Date(finishedJob.finishedAt).getTime();
          if (ageMs >= 0 && ageMs <= 15 * 60 * 1000) {
            jobStatus = finishedJob.status;
            jobId = String(finishedJob.id);
          }
        }
        if (jobStatus === "NONE" && pendingCount > 0) {
          jobStatus = "PENDING";
        }
      }

      return {
        workerId,
        status: worker?.status || WorkerStatus.OFFLINE,
        jobStatus,
        jobId,
        pending: pendingCount > 0,
      };
    } catch (error) {
      this.logger.error("obtenerEstadoWorker fallo", error as Error);
      return {
        workerId,
        status: WorkerStatus.OFFLINE,
        jobStatus: "NONE",
        jobId: null,
        pending: false,
      };
    }
  }

  async solicitarApagado(input: WorkerShutdownDto) {
    const habilitado = this.workerActivationService.awsAutoShutdownHabilitado();

    await this.registrarHeartbeat({
      workerId: input.workerId,
      status: WorkerStatus.IDLE,
      metadata: {
        reason: input.reason || "IDLE_TIMEOUT",
        idleSeconds: String(input.idleSeconds ?? ""),
      },
    });

    this.logger.log(
      `Solicitud de apagado worker=${input.workerId} reason=${input.reason || "IDLE_TIMEOUT"} awsAutoShutdown=${habilitado}`,
    );

    if (!habilitado) {
      return {
        requested: false,
        awsAutoShutdown: 0,
        workerId: input.workerId,
        reason:
          "AWS_AUTO_SHUTDOWN deshabilitado. La instancia permanece encendida.",
      };
    }

    return this.workerActivationService.solicitarApagadoAws(input.workerId);
  }

  async registrarLog(input: WorkerLogDto): Promise<WpaWorkerLog> {
    const log = await this.logRepository.save(
      this.logRepository.create({
        source: input.source,
        level: input.level,
        message: input.message,
        workerId: input.workerId || null,
        jobId: input.jobId || null,
        host: input.host || null,
        metadata: input.metadata || null,
      }),
    );

    const linea = `[${input.source}] ${input.message}`;
    if (input.level === WpaLogLevel.ERROR) {
      this.logger.error(linea);
    } else {
      this.logger.log(linea);
    }

    return log;
  }

  obtenerLogs(limit = 100, level?: WpaLogLevel) {
    return this.logRepository.find({
      where: level ? { level } : {},
      order: { createdAt: "DESC" },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  resolverRecursoWorker(fileName: string): {
    path: string;
    downloadName: string;
    contentType: string;
  } {
    const recurso = this.recursosWorker[fileName];
    if (!recurso) {
      throw new NotFoundException("El recurso solicitado no existe.");
    }

    const carpetas = [
      join(__dirname, "worker"),
      join(process.cwd(), "src", "wpas", "worker"),
      join(process.cwd(), "dist", "wpas", "worker"),
    ];

    for (const carpeta of carpetas) {
      const path = join(carpeta, recurso.file);
      if (existsSync(path)) {
        return {
          path,
          downloadName: recurso.downloadName,
          contentType: recurso.contentType,
        };
      }
    }

    throw new NotFoundException(
      `No se encontro el recurso ${recurso.file} en el servidor.`,
    );
  }

  async obtenerReservacionesDelJob(jobId: string): Promise<{
    source: "FILE" | "HTTP";
    reservations: string[];
  }> {
    const job = await this.jobRepository.findOneBy({ id: this.toJobId(jobId) });
    if (!job) throw new NotFoundException("El job WPA no existe.");

    const reservations = validateReservations(job.reservations);
    return { source: job.source, reservations };
  }

  private resolverOrigenYReservaciones(
    input: CreateWpaJobDto,
    file?: UploadedReservationFile,
  ): { source: "FILE" | "HTTP"; reservations: string[] } {
    const tieneArchivo = Boolean(file?.buffer?.length);
    const tieneJson =
      Array.isArray(input.reservations) && input.reservations.length > 0;
    const source = input.source || (tieneArchivo ? "FILE" : "HTTP");

    if (source !== "HTTP" && source !== "FILE") {
      throw new BadRequestException("Solo se permiten los modos HTTP o FILE.");
    }

    if (tieneArchivo && tieneJson) {
      throw new BadRequestException(
        "Solo se debe ejecutar un modo. Envie JSON (HTTP) o un archivo .txt (FILE), no ambos.",
      );
    }

    if (source === "HTTP") {
      if (tieneArchivo) {
        throw new BadRequestException(
          'El modo HTTP no acepta archivo. Envie { "source": "HTTP", "reservations": [...] }.',
        );
      }
      return { source, reservations: validateReservations(input.reservations) };
    }

    if (!tieneArchivo) {
      throw new BadRequestException(
        "El modo FILE requiere cargar un archivo .txt con una reservacion por linea.",
      );
    }

    const uploaded = file;
    if (!uploaded || !this.esArchivoTxt(uploaded)) {
      throw new BadRequestException(
        "El modo FILE solo acepta un archivo .txt con el formato de reservaciones.",
      );
    }

    return {
      source,
      reservations: parseReservationFile(uploaded.buffer.toString("utf8")),
    };
  }

  private normalizarWpa(valor?: string | null): string | number {
    if (valor == null || valor === "" || valor === "0000") return "0000";
    const numeric = Number(valor);
    return Number.isFinite(numeric) ? numeric : valor;
  }

  private esArchivoTxt(file?: UploadedReservationFile): boolean {
    if (!file) return false;
    const name = (file.originalname || "").toLowerCase();
    const mime = (file.mimetype || "").toLowerCase();
    return (
      name.endsWith(".txt") ||
      mime === "text/plain" ||
      mime === "application/octet-stream"
    );
  }

  private exponerJobAlCliente(job: WpaJob) {
    if (job.status === WpaJobStatus.ERROR) {
      const result = (job.result || {}) as WpaSyncPayload;
      throw new HttpException(
        {
          status: result.status || "error",
          errorCode: result.errorCode ?? 999,
          message: result.message || "El script BlueZone reporto un error.",
          stats: result.stats || {
            total: 0,
            correctos: 0,
            noEncontrados: 0,
            errores: 0,
          },
          results: result.results || [],
          jobId: job.id,
          source: job.source,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return job;
  }

  private async hayWorkerOnline(): Promise<boolean> {
    return (
      (await this.workerRepository.count({
        where: {
          lastHeartbeatAt: MoreThanOrEqual(new Date(Date.now() - 90_000)),
        },
      })) > 0
    );
  }

  private toJobId(jobId: string): number {
    const id = Number(jobId);
    if (!Number.isInteger(id) || id < 1)
      throw new BadRequestException("El id del job WPA no es valido.");
    return id;
  }
}