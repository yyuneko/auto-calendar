import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const parseRequestSchema = z.object({
	userId: z.string().min(1).max(120),
	text: z.string().min(1).max(2000),
	timezone: z.string().min(1).max(80).default('Asia/Shanghai'),
});

export const parsedEventSchema = z.object({
	summary: z.string().min(1),
	startTime: isoDateTime,
	endTime: isoDateTime,
	location: z.string().default(''),
	description: z.string().default(''),
	isAllDay: z.boolean().optional().default(false),
	rrule: z.string().trim().optional(),
});

export const aiCalendarOperationSchema = z.object({
	action: z.enum(['create', 'update', 'delete']),
	targetEventId: z.string().optional(),
	event: parsedEventSchema.partial().optional(),
});

export const aiCalendarOperationBatchSchema = z.object({
	operations: z.array(aiCalendarOperationSchema).min(1).max(20),
});
