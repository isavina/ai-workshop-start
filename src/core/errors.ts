/** A failure explained to the user: the CLI prints the message and exits with code 1. */
export class AtlasError extends Error {}

/**
 * Something one repository does not have: the repository, a branch, tag or commit. Scanning an
 * organization, it costs only that repository: a warning, and the scan goes on.
 */
export class NotFoundError extends AtlasError {}

/** A repository without a commit: an organization's scan leaves it out. */
export class EmptyRepositoryError extends NotFoundError {}
