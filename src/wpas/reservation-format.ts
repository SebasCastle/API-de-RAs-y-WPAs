import { BadRequestException } from "@nestjs/common";

/** Formato: 8 dígitos, 2 letras de país y 1 dígito. Ejemplo: 24388509MX5 */
export const RESERVATION_PATTERN = /^\d{8}[A-Z]{2}\d$/;

export function normalizeReservation(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidReservation(value: string): boolean {
  return RESERVATION_PATTERN.test(normalizeReservation(value));
}

export function validateReservations(list: string[] | undefined): string[] {
  if (!list || list.length === 0) {
    throw new BadRequestException("no existen reservaciones a procesar");
  }

  const reservations: string[] = [];
  for (const raw of list) {
    const reservation = normalizeReservation(String(raw ?? ""));
    if (!reservation) {
      continue;
    }
    if (!isValidReservation(reservation)) {
      throw new BadRequestException(
        `Formato de reservacion invalido: "${raw}". Use 8 digitos, 2 letras y 1 digito (ejemplo: 24388509MX5).`,
      );
    }
    reservations.push(reservation);
  }

  if (reservations.length === 0) {
    throw new BadRequestException("no existen reservaciones a procesar");
  }

  return reservations;
}

export function parseReservationFile(content: string): string[] {
  if (!content || !content.trim()) {
    throw new BadRequestException(
      "El archivo .txt esta vacio o no tiene reservaciones con formato valido.",
    );
  }

  const reservations: string[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (!isValidReservation(line)) {
      throw new BadRequestException(
        `Formato de reservacion invalido en archivo: "${line}". Use 8 digitos, 2 letras y 1 digito (ejemplo: 24388509MX5).`,
      );
    }
    reservations.push(normalizeReservation(line));
  }

  if (reservations.length === 0) {
    throw new BadRequestException("no existen reservaciones a procesar");
  }

  return reservations;
}
