/** Base class for all domain errors. `code` is a stable machine-readable identifier. */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** No authenticated session (HTTP 401). Contrast with `ForbiddenError` (authenticated, not allowed). */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly machine: string;
  readonly from: string;
  readonly event: string;

  constructor(machine: string, from: string, event: string) {
    super('INVALID_TRANSITION', `Invalid transition in ${machine}: ${event} from ${from}`);
    this.machine = machine;
    this.from = from;
    this.event = event;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message);
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation failed') {
    super('VALIDATION', message);
  }
}
