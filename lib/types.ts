export type CalendarEvent = {
	id: string;
	userId: string;
	summary: string;
	startTime: string;
	endTime: string;
	description: string;
	location: string;
	isAllDay: boolean;
	rrule?: string;
	createdAt: string;
	updatedAt: string;
};

export type SubscriptionToken = {
	token: string;
	userId: string;
	createdAt: string;
};

export type ParsedEventInput = {
	summary: string;
	startTime: string;
	endTime: string;
	location: string;
	description: string;
	isAllDay?: boolean;
	rrule?: string;
};
