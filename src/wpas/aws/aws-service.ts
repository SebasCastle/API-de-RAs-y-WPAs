import { Injectable, Logger } from "@nestjs/common";
import {
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AwsService {
  private readonly logger = new Logger(AwsService.name);

  private readonly ec2: EC2Client;

  constructor(private readonly config: ConfigService) {
    this.ec2 = new EC2Client({
      region: this.config.get<string>("AWS_REGION", "us-east-1"),
    });
  }

  async iniciarInstancia() {
    const instanceId = this.config.get<string>("AWS_INSTANCE_ID");

    if (!instanceId) {
      throw new Error("AWS_INSTANCE_ID no está configurado.");
    }

    this.logger.log(`Iniciando instancia EC2: ${instanceId}`);

    const command = new StartInstancesCommand({
      InstanceIds: [instanceId],
    });

    const response = await this.ec2.send(command);

    const instance = response.StartingInstances?.[0];

    return {
      requested: true,
      instanceId,
      previousState: instance?.PreviousState?.Name,
      currentState: instance?.CurrentState?.Name,
    };
  }

  async apagarInstancia() {
    const instanceId = this.config.get<string>("AWS_INSTANCE_ID");

    if (!instanceId) {
      throw new Error("AWS_INSTANCE_ID no está configurado.");
    }

    this.logger.log(`Solicitando apagado de EC2: ${instanceId}`);

    const command = new StopInstancesCommand({
      InstanceIds: [instanceId],
    });

    const response = await this.ec2.send(command);

    const instance = response.StoppingInstances?.[0];

    return {
      requested: true,
      instanceId,
      previousState: instance?.PreviousState?.Name,
      currentState: instance?.CurrentState?.Name,
    };
  }

  async obtenerEstado() {
    const instanceId = this.config.get<string>("AWS_INSTANCE_ID");

    if (!instanceId) {
      throw new Error("AWS_INSTANCE_ID no está configurado.");
    }

    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });

    const response = await this.ec2.send(command);

    const instance = response.Reservations?.[0]?.Instances?.[0];

    return {
      instanceId,
      state: instance?.State?.Name,
    };
  }
}
