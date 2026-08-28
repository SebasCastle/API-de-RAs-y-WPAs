import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema({ timestamps: true })
export class WPA extends Document {
  @Prop({ required: true, unique: true, index: true })
  resNum!: string;

  @Prop({ default: "" })
  wpa!: string;

  @Prop({ default: "PENDING", index: true })
  status!: string;

  @Prop({ default: "" })
  message!: string;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop()
  processedAt?: Date;
}

export const WpaSchema = SchemaFactory.createForClass(WPA);
