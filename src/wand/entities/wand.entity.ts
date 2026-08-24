import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class WandRA extends Document {
  //id: string // como me lo da la api mongo ya sebe como luce
  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  raNum!: string;

  @Prop({
    unique: true,
    index: true,
  })
  resNum!: string;

  @Prop()
  ldw!: string;

  @Prop()
  pai!: string;

  @Prop()
  pep!: string;

  @Prop()
  ali!: string;

  @Prop()
  totalChargesRateAmt!: string;

  @Prop()
  amtDueRateAmt!: string;
}

export const WandSchema = SchemaFactory.createForClass(WandRA);
