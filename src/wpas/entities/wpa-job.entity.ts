import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export enum WpaJobStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  ERROR = "ERROR",
}

/** Una ejecucion completa solicitada a un worker BlueZone. */
@Entity("wpa_jobs")
export class WpaJob {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["FILE", "HTTP"], default: "FILE" })
  source!: "FILE" | "HTTP";

  @Column({ type: "json" })
  reservations!: string[];

  @Index()
  @Column({ type: "enum", enum: WpaJobStatus, default: WpaJobStatus.PENDING })
  status!: WpaJobStatus;

  @Index()
  @Column({ name: "worker_id", type: "varchar", length: 128, nullable: true })
  workerId?: string | null;

  @Column({ name: "started_at", type: "datetime", nullable: true })
  startedAt?: Date | null;

  @Column({ name: "finished_at", type: "datetime", nullable: true })
  finishedAt?: Date | null;

  @Column({ type: "json", nullable: true })
  result?: object | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
