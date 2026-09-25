import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum WorkerStatus {
  ONLINE = "ONLINE",
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  BUSY = "BUSY",
  COMPLETED = "COMPLETED",
  IDLE = "IDLE",
  OFFLINE = "OFFLINE",
  ERROR = "ERROR",
}

/** Estado y ultimo heartbeat de una maquina Windows con BlueZone. */
@Entity("wpa_workers")
export class WpaWorker {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "worker_id", type: "varchar", length: 128 })
  workerId!: string;

  @Column({ type: "varchar", length: 32, default: WorkerStatus.ONLINE })
  status!: WorkerStatus;

  @Column({
    name: "current_job_id",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  currentJobId?: string | null;

  @Index()
  @Column({ name: "last_heartbeat_at", type: "datetime" })
  lastHeartbeatAt!: Date;

  @Column({ type: "json" })
  metadata!: Record<string, string>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
