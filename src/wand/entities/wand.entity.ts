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
    type: String,
    default: null,
  })
  resNum!: string | null;

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
  outString!: string;

  @Prop()
  qvDiEstTotalClosed!: string;
}

export const WandSchema = SchemaFactory.createForClass(WandRA);

// Índice único solamente para resNum válidos
WandSchema.index(
  { resNum: 1 },
  {
    unique: true,
    partialFilterExpression: {
      resNum: { $type: "string", $ne: "" },
    },
  },
);
