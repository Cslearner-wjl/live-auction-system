import { validationFailed } from "./api-error";

export interface PaginationInput {
  page?: unknown;
  pageSize?: unknown;
}

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function parsePagination(input: PaginationInput): Pagination {
  const page = parsePositiveInteger(input.page, 1, "page");
  const pageSize = parsePositiveInteger(input.pageSize, 20, "pageSize");

  if (pageSize > 100) {
    throw validationFailed("pageSize", "must be between 1 and 100");
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export function toPageMeta(pagination: Pagination, total: number): PageMeta {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.ceil(total / pagination.pageSize)
  };
}

function parsePositiveInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (Array.isArray(value)) {
    throw validationFailed(field, "must be an integer");
  }

  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw validationFailed(field, "must be greater than or equal to 1");
  }

  return normalized;
}
