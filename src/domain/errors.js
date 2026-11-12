// Erros de negócio. O domínio não conhece HTTP: a camada API traduz o tipo em status.
export class DomainError extends Error {
  constructor(type, message, details = undefined) {
    super(message);
    this.name = 'DomainError';
    this.type = type; // validation | not_found | conflict
    this.details = details;
  }
}

export const validation = (message, details) => new DomainError('validation', message, details);
export const notFound = (message) => new DomainError('not_found', message);
export const conflict = (message) => new DomainError('conflict', message);
