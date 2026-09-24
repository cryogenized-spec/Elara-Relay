import type {
  ScheduledActionRun,
  ScheduledDeliverySnapshot,
} from '../contracts/scheduler';

export interface DeliveryRequest {
  delivery: ScheduledDeliverySnapshot;
  run: ScheduledActionRun;
  idempotencyKey: string;
}

export interface DeliveryReceipt {
  providerMessageId: string | null;
}

export interface DeliveryProvider {
  deliver(request: DeliveryRequest): Promise<DeliveryReceipt>;
}

export interface EmailProvider {
  sendOwnerEmail(input: {
    subject: string;
    body: string;
    idempotencyKey: string;
  }): Promise<DeliveryReceipt>;
}
