import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum WpaLogLevel {
  INFO = "INFO",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

@Entity("wpa_worker_logs")
export class WpaWorkerLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: "varchar", length: 128 })
  source!: string;

  @Index()
  @Column({ type: "enum", enum: WpaLogLevel, default: WpaLogLevel.INFO })
  level!: WpaLogLevel;

  @Column({ type: "text" })
  message!: string;

  @Index()
  @Column({ name: "worker_id", type: "varchar", length: 128, nullable: true })
  workerId?: string | null;

  @Column({ name: "job_id", type: "varchar", length: 64, nullable: true })
  jobId?: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  host?: string | null;

  @Column({ type: "json", nullable: true })
  metadata?: Record<string, string> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
