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

    const services = Object.fromEntries(
      Object.entries({
        vhs: "https://vhs.service.com/search",
        dvd: "https://dvd.service.com/search",
        projector: "https://projector.service.com/search",
      }).filter(([key]) => {
        if (key === "vhs" && requestBody.excludeVHS) return false;
        if (key === "dvd" && requestBody.excludeDVD) return false;
        if (key === "projector" && requestBody.excludeProjector) return false;
        return true;
      })
    ) as Record<ServiceKey, string>;

    const sortField = requestBody.sortField;
    const sortDirection = requestBody.sortDirection;

    const currentPages: Record<ServiceKey, number> = requestBody.nextPageKey
      ? decodeNextPageKey(requestBody.nextPageKey)
      : { vhs: 1, dvd: 1, projector: 1 };

    const serviceStates: Record<
      ServiceKey,
      {
        currentPage: number;
        buffer: Film[];
        noMoreData: boolean;
      }
    > = {
      vhs: { currentPage: currentPages.vhs, buffer: [], noMoreData: false },
      dvd: { currentPage: currentPages.dvd, buffer: [], noMoreData: false },
      projector: {
        currentPage: currentPages.projector,
        buffer: [],
        noMoreData: false,
      },
    };

    for (const key in services) {
      serviceStates[key as ServiceKey] = {
        currentPage: currentPages[key as ServiceKey] ?? 1,
        buffer: [],
        noMoreData: false,
      };
    }

    const mergedFilms: Film[] = [];

    while (
      mergedFilms.length < requestBody.pageSize &&
      Object.keys(serviceStates).length > 0
    ) {
      const fetchPromises = Object.keys(serviceStates).map(async (key) => {
        const serviceKey = key as ServiceKey;
        const url = services[serviceKey];
        const state = serviceStates[serviceKey];
        if (state.buffer.length > 0 || state.noMoreData) {
          return;
        }
        try {
          const response = await axios.post(url, {
            sortField,
            sortDirection,
            currentPage: state.currentPage,
            pageSize: requestBody.pageSize,
            search: requestBody.search,
          });
          const data = response.data;
          state.buffer = data.films as Film[];

          if (
            state.buffer.length === 0 ||
            state.buffer.length < requestBody.pageSize
          ) {
            state.noMoreData = true;
          } else {
            state.currentPage += 1;
          }
        } catch (error: any) {
          console.error(`Error fetching data from ${url}:`, error.message);
          delete serviceStates[serviceKey];
        }
      });

      await Promise.all(fetchPromises);

      let nextFilm: Film | null = null;
      let nextServiceKey: ServiceKey | null = null;

      for (const key in serviceStates) {
        const serviceKey = key as ServiceKey;
        const state = serviceStates[serviceKey];
        if (state.buffer.length === 0) {
          continue;
        }
        const film = state.buffer[0];
        if (
          !nextFilm ||
          compare(film, nextFilm, sortField, sortDirection) < 0
        ) {
          nextFilm = film;
          nextServiceKey = serviceKey;
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

      const state = serviceStates[nextServiceKey];
      if (state.buffer.length === 0 && state.noMoreData) {
        delete serviceStates[nextServiceKey];
      }
    }

    const remainingPages = Object.fromEntries(
      Object.entries(serviceStates)
        .filter(([_, state]) => !state.noMoreData)
        .map(([key, state]) => [key, state.currentPage])
    ) as Record<ServiceKey, number>;

    const nextPageKey =
      Object.keys(remainingPages).length > 0
        ? encodeNextPageKey(remainingPages)
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

function encodeNextPageKey(pages: Record<ServiceKey, number>): string | null {
  if (Object.keys(pages).length === 0) {
    return null;
  }
  return Buffer.from(JSON.stringify(pages)).toString("base64");
}

function decodeNextPageKey(nextPageKey: string): Record<ServiceKey, number> {
  const pages = JSON.parse(
    Buffer.from(nextPageKey, "base64").toString("utf-8")
  );
  return pages;
}
