import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** Cache local de datos WAND. Reemplaza el Schema de Mongoose. */
@Entity("wand_ras")
export class WandRA {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "ra_num", type: "varchar", length: 64 })
  raNum!: string;

  @Index({ unique: true })
  @Column({ name: "res_num", type: "varchar", length: 64, nullable: true })
  resNum!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true }) ldw?: string | null;
  @Column({ type: "varchar", length: 64, nullable: true }) pai?: string | null;
  @Column({ type: "varchar", length: 64, nullable: true }) pep?: string | null;
  @Column({ type: "varchar", length: 64, nullable: true }) ali?: string | null;
  @Column({
    name: "total_charges_rate_amt",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  totalChargesRateAmt?: string | null;
  @Column({ name: "out_string", type: "text", nullable: true }) outString?:
    string | null;

  @Column({
    name: "qv_di_est_total",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  qvDiEstTotal?: string | null;

  @Column({
    name: "qv_di_est_total_closed",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  qvDiEstTotalClosed?: string | null;

  @Column({
    name: "status",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  rentalStatus?: string;
}
