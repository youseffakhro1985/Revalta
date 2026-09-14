export type IntegrationListEvent = {
  type: string;
  status: string;
};

export function isUnmatchedInboundSms(event: IntegrationListEvent) {
  return event.type === "sms" && event.status === "unmatched";
}

export function unmatchedInboundSmsCount(events: IntegrationListEvent[]) {
  return events.filter(isUnmatchedInboundSms).length;
}

export function withUnmatchedInboundSmsFirst<T extends IntegrationListEvent>(events: T[]) {
  return [...events].sort((left, right) => Number(isUnmatchedInboundSms(right)) - Number(isUnmatchedInboundSms(left)));
}
