import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/** Resultado persistente por reservacion. Reemplaza el Schema de Mongoose. */
@Entity("wpas")
export class WPA {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "res_num", type: "varchar", length: 64 })
  resNum!: string;

  @Column({ type: "varchar", length: 64, default: "" })
  wpa!: string;

  @Index()
  @Column({ type: "varchar", length: 32, default: "PENDING" })
  status!: string;

  @Column({ type: "text", default: "" })
  message!: string;

  @Column({ type: "int", default: 0 })
  attempts!: number;

  @Column({ name: "processed_at", type: "datetime", nullable: true })
  processedAt?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
