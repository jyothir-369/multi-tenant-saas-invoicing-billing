export enum OutboxEventType {
  // Invoice events
  INVOICE_PAID = 'INVOICE_PAID',
  INVOICE_OVERDUE = 'INVOICE_OVERDUE',
  INVOICE_SENT = 'INVOICE_SENT',
  
  // Payment events
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  REFUND_PROCESSED = 'REFUND_PROCESSED',
  
  // Async notification events
  SEND_INVOICE_EMAIL = 'SEND_INVOICE_EMAIL',
  SEND_RECEIPT_EMAIL = 'SEND_RECEIPT_EMAIL',
  SEND_OVERDUE_REMINDER = 'SEND_OVERDUE_REMINDER',
  
  // PDF generation events
  GENERATE_INVOICE_PDF = 'GENERATE_INVOICE_PDF',
  
  // Recurring events
  RECURRING_INVOICE_GENERATE = 'RECURRING_INVOICE_GENERATE',
}

export interface InvoiceEmailPayload {
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  invoiceNumber: string;
  dueDate: string;
  pdfUrl?: string;
}

export interface ReceiptEmailPayload {
  paymentId: string;
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  paidAt: string;
  receiptNumber: string;
}

export interface OverdueReminderPayload {
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  invoiceNumber: string;
  dueDate: string;
  daysOverdue: number;
}

export interface GeneratePdfPayload {
  invoiceId: string;
  tenantId: string;
  outputPath?: string;
}

export interface RecurringInvoicePayload {
  tenantId: string;
  customerId: string;
  recurrenceRule: string;
}
