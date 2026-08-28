import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
export enum WpaJobStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  ERROR = "ERROR",
}
@Schema({ timestamps: true })
export class WpaJob extends Document {
  [x: string]: any;
  @Prop({ enum: ["FILE", "HTTP"], default: "FILE" }) source!: "FILE" | "HTTP";
  @Prop({ type: [String], default: [] }) reservations!: string[];
  @Prop({ enum: WpaJobStatus, default: WpaJobStatus.PENDING, index: true })
  status!: WpaJobStatus;
  @Prop({ index: true }) workerId?: string;
  @Prop() startedAt?: Date;
  @Prop() finishedAt?: Date;
  @Prop({ type: Object }) result?: object;
}
export const WpaJobSchema = SchemaFactory.createForClass(WpaJob);
