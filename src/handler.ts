// src/handler.ts

import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import axios from "axios";

export type FilmSearchRequest = {
  pageSize: number;
  sortField: "title" | "releaseYear";
  sortDirection: "ASC" | "DESC";
  excludeVHS: boolean;
  excludeDVD: boolean;
  excludeProjector: boolean;
  search: {
    title?: string;
    releaseYear?: number;
    director?: string;
    distributor?: string;
  };
  nextPageKey?: string;
};

export type Film = {
  title: string;
  releaseYear: number;
  numberOfCopiesAvailable: number;
  director: string;
  distributor: string;
};

type ServiceKey = "vhs" | "dvd" | "projector";

export const searchFilms: APIGatewayProxyHandler = async (
  event
): Promise<APIGatewayProxyResult> => {
  try {
    console.log("Received event:", event);

    if (!event.body) {
      throw new Error("Request body is missing");
    }

    const requestBody: FilmSearchRequest = JSON.parse(event.body);

    const services: Record<ServiceKey, string> = {
      vhs: "https://vhs.service.com/search",
      dvd: "https://dvd.service.com/search",
      projector: "https://projector.service.com/search",
    };

    const activeServices = Object.entries(services).filter(([key]) => {
      if (key === "vhs" && requestBody.excludeVHS) return false;
      if (key === "dvd" && requestBody.excludeDVD) return false;
      if (key === "projector" && requestBody.excludeProjector) return false;
      return true;
    }) as [ServiceKey, string][];

    const sortField = requestBody.sortField;
    const sortDirection = requestBody.sortDirection;

    const cursors: Record<ServiceKey, number> = requestBody.nextPageKey
      ? decodeNextPageKey(requestBody.nextPageKey)
      : { vhs: 0, dvd: 0, projector: 0 };

    const serviceStates: Record<
      ServiceKey,
      {
        cursor: number | null;
        buffer: Film[];
      }
    > = {} as any;

    const activeServiceKeys: ServiceKey[] = activeServices.map(([key]) => key);

    for (const key of activeServiceKeys) {
      serviceStates[key] = {
        cursor: cursors[key] ?? 0,
        buffer: [],
      };
    }

    const mergedFilms: Film[] = [];

    while (
      mergedFilms.length < requestBody.pageSize &&
      activeServiceKeys.length > 0
    ) {
      const fetchPromises = activeServiceKeys.map(async (key) => {
        const url = services[key];
        const state = serviceStates[key];
        if (state.buffer.length > 0 || state.cursor === null) {
          return;
        }
        try {
          const response = await axios.post(url, {
            ...requestBody,
            sortField,
            sortDirection,
            cursor: state.cursor,
            pageSize: requestBody.pageSize,
          });
          const data = response.data;
          state.buffer = data.films as Film[];
          state.cursor = data.nextCursor;

          if (state.buffer.length === 0 && state.cursor === null) {
            const index = activeServiceKeys.indexOf(key);
            if (index > -1) {
              activeServiceKeys.splice(index, 1);
            }
            delete serviceStates[key];
          }
        } catch (error: any) {
          console.error(`Error fetching data from ${url}:`, error.message);
          const index = activeServiceKeys.indexOf(key);
          if (index > -1) {
            activeServiceKeys.splice(index, 1);
          }
          delete serviceStates[key];
        }
      });

      await Promise.all(fetchPromises);

      let nextFilm: Film | null = null;
      let nextServiceKey: ServiceKey | null = null;

      for (const key of activeServiceKeys) {
        const state = serviceStates[key];
        if (state.buffer.length === 0) {
          continue;
        }
        const film = state.buffer[0];
        if (
          !nextFilm ||
          compare(film, nextFilm, sortField, sortDirection) < 0
        ) {
          nextFilm = film;
          nextServiceKey = key;
        }
      }

      if (!nextFilm || !nextServiceKey) {
        break;
      }

      serviceStates[nextServiceKey].buffer.shift();

      const filmKey = `${nextFilm.title}-${nextFilm.releaseYear}`;
      const existingFilmIndex = mergedFilms.findIndex(
        (f) => `${f.title}-${f.releaseYear}` === filmKey
      );

      if (existingFilmIndex === -1) {
        mergedFilms.push({ ...nextFilm });
      } else {
        mergedFilms[existingFilmIndex].numberOfCopiesAvailable +=
          nextFilm.numberOfCopiesAvailable;
      }

      if (
        serviceStates[nextServiceKey].buffer.length === 0 &&
        serviceStates[nextServiceKey].cursor === null
      ) {
        const index = activeServiceKeys.indexOf(nextServiceKey);
        if (index > -1) {
          activeServiceKeys.splice(index, 1);
        }
        delete serviceStates[nextServiceKey];
      }
    }

    const remainingCursors = Object.fromEntries(
      Object.entries(serviceStates)
        .filter(([_, state]) => state.cursor !== null)
        .map(([key, state]) => [key, state.cursor!])
    ) as Record<ServiceKey, number>;

    const nextPageKey =
      Object.keys(remainingCursors).length > 0
        ? encodeNextPageKey(remainingCursors)
        : null;

    return {
      statusCode: 200,
      body: JSON.stringify({
        films: mergedFilms,
        nextPageKey,
      }),
    };
  } catch (error: any) {
    console.error("Error processing request:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

function compare(
  a: Film,
  b: Film,
  sortField: "title" | "releaseYear",
  sortDirection: "ASC" | "DESC"
): number {
  let result = 0;
  if (sortField === "title") {
    result = a.title.localeCompare(b.title);
  } else {
    result = a.releaseYear - b.releaseYear;
  }
  return sortDirection === "ASC" ? result : -result;
}

function encodeNextPageKey(cursors: Record<ServiceKey, number>): string | null {
  if (Object.keys(cursors).length === 0) {
    return null;
  }
  return Buffer.from(JSON.stringify(cursors)).toString("base64");
}

function decodeNextPageKey(nextPageKey: string): Record<ServiceKey, number> {
  const cursors = JSON.parse(
    Buffer.from(nextPageKey, "base64").toString("utf-8")
  );
  return cursors;
}
