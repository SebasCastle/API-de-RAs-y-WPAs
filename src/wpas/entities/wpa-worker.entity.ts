import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";
export enum WorkerStatus {
  ONLINE = "ONLINE",
  BUSY = "BUSY",
  OFFLINE = "OFFLINE",
  ERROR = "ERROR",
}
@Schema({ timestamps: true })
export class WpaWorker extends Document {
  @Prop({ required: true, unique: true, index: true }) workerId!: string;
  @Prop({ enum: WorkerStatus, default: WorkerStatus.ONLINE })
  status!: WorkerStatus;
  @Prop() currentJobId?: string;
  @Prop({ required: true, index: true }) lastHeartbeatAt!: Date;
  @Prop({ type: Object, default: {} }) metadata!: Record<string, string>;
}
export const WpaWorkerSchema = SchemaFactory.createForClass(WpaWorker);
