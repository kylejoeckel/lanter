// tests/handler.test.ts

import { searchFilms, Film } from "../src/handler";
import axios from "axios";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
  Callback,
} from "aws-lambda";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("searchFilms", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const context: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: "testFunction",
    functionVersion: "1",
    invokedFunctionArn:
      "arn:aws:lambda:us-east-1:123456789012:function:testFunction",
    memoryLimitInMB: "128",
    awsRequestId: "test",
    logGroupName: "test",
    logStreamName: "test",
    getRemainingTimeInMillis: () => 1000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  const callback: Callback<APIGatewayProxyResult> = jest.fn();

  it("should return aggregated and deduplicated results with correct sorting and provide nextPageKey", async () => {
    const vhsData: Film[] = [
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 2,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
      {
        title: "Avengers: Endgame",
        releaseYear: 2019,
        numberOfCopiesAvailable: 1,
        director: "Anthony Russo",
        distributor: "Marvel",
      },
    ];

    const dvdData: Film[] = [
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 3,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
    ];

    const projectorData: Film[] = [
      {
        title: "Interstellar",
        releaseYear: 2014,
        numberOfCopiesAvailable: 2,
        director: "Christopher Nolan",
        distributor: "Paramount",
      },
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 1,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
    ];

    mockedAxios.post.mockImplementation((url, data?: any) => {
      const body = data as any;
      const sortField = body.sortField;
      const sortDirection = body.sortDirection;
      const cursor: number = body.cursor ?? 0;
      const pageSize = body.pageSize || 10;

      let films: Film[] = [];

      if (url.includes("vhs")) {
        films = vhsData;
      } else if (url.includes("dvd")) {
        films = dvdData;
      } else if (url.includes("projector")) {
        films = projectorData;
      }

      films = applySearchFilters(films, body.search);

      films.sort((a, b) => {
        let result = 0;
        if (sortField === "title") {
          result = a.title.localeCompare(b.title);
        } else {
          result = a.releaseYear - b.releaseYear;
        }
        return sortDirection === "ASC" ? result : -result;
      });

      const startIndex = cursor;
      const endIndex = Math.min(startIndex + pageSize, films.length);
      const filmsPage = films.slice(startIndex, endIndex);

      const nextCursor: number | null =
        endIndex < films.length ? endIndex : null;

      return Promise.resolve({
        data: {
          films: filmsPage,
          nextCursor,
        },
      });
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 5,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: false,
        excludeDVD: false,
        excludeProjector: false,
        search: {},
        nextPageKey: null,
      }),
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);

    expect(responseBody.films).toEqual([
      {
        title: "Avengers: Endgame",
        releaseYear: 2019,
        numberOfCopiesAvailable: 1,
        director: "Anthony Russo",
        distributor: "Marvel",
      },
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
      {
        title: "Interstellar",
        releaseYear: 2014,
        numberOfCopiesAvailable: 2,
        director: "Christopher Nolan",
        distributor: "Paramount",
      },
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 6,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
    ]);

    expect(responseBody.nextPageKey).toBeNull();
  });

  it("should handle exclusion of VHS and aggregate results correctly", async () => {
    const dvdData: Film[] = [
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 3,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
    ];

    const projectorData: Film[] = [
      {
        title: "Interstellar",
        releaseYear: 2014,
        numberOfCopiesAvailable: 2,
        director: "Christopher Nolan",
        distributor: "Paramount",
      },
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 1,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
    ];

    mockedAxios.post.mockImplementation((url, data?: any) => {
      const body = data as any;
      const sortField = body.sortField;
      const sortDirection = body.sortDirection;
      const cursor: number = body.cursor ?? 0;
      const pageSize = body.pageSize || 10;

      let films: Film[] = [];

      if (url.includes("vhs")) {
        films = []; // VHS is excluded
      } else if (url.includes("dvd")) {
        films = dvdData;
      } else if (url.includes("projector")) {
        films = projectorData;
      }

      films = applySearchFilters(films, body.search);

      films.sort((a, b) => {
        let result = 0;
        if (sortField === "releaseYear") {
          result = a.releaseYear - b.releaseYear;
        } else {
          result = a.title.localeCompare(b.title);
        }
        return sortDirection === "DESC" ? -result : result;
      });

      const startIndex = cursor;
      const endIndex = Math.min(startIndex + pageSize, films.length);
      const filmsPage = films.slice(startIndex, endIndex);

      const nextCursor: number | null =
        endIndex < films.length ? endIndex : null;

      return Promise.resolve({
        data: {
          films: filmsPage,
          nextCursor,
        },
      });
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 5,
        sortField: "releaseYear",
        sortDirection: "DESC",
        excludeVHS: true,
        excludeDVD: false,
        excludeProjector: false,
        search: {},
        nextPageKey: null,
      }),
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);

    expect(responseBody.films).toEqual([
      {
        title: "Interstellar",
        releaseYear: 2014,
        numberOfCopiesAvailable: 2,
        director: "Christopher Nolan",
        distributor: "Paramount",
      },
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
      {
        title: "Psycho",
        releaseYear: 1960,
        numberOfCopiesAvailable: 4,
        director: "Alfred Hitchcock",
        distributor: "Universal",
      },
    ]);

    expect(responseBody.nextPageKey).toBeNull();
  });

  it("should correctly handle search parameters", async () => {
    const dvdData: Film[] = [
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
      {
        title: "The Dark Knight",
        releaseYear: 2008,
        numberOfCopiesAvailable: 4,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
    ];

    const projectorData: Film[] = [
      {
        title: "Interstellar",
        releaseYear: 2014,
        numberOfCopiesAvailable: 2,
        director: "Christopher Nolan",
        distributor: "Paramount",
      },
    ];

    mockedAxios.post.mockImplementation((url: string, data?: any) => {
      const body = data as any;
      const search = body.search;
      const sortField = body.sortField;
      const sortDirection = body.sortDirection;
      const cursor: number = body.cursor ?? 0;
      const pageSize = body.pageSize || 10;

      let films: Film[] = [];

      if (url.includes("dvd")) {
        films = dvdData;
      } else if (url.includes("projector")) {
        films = projectorData;
      } else {
        films = [];
      }

      films = applySearchFilters(films, search);

      films.sort((a, b) => {
        let result = 0;
        if (sortField === "title") {
          result = a.title.localeCompare(b.title);
        } else {
          result = a.releaseYear - b.releaseYear;
        }
        return sortDirection === "ASC" ? result : -result;
      });

      const startIndex = cursor;
      const endIndex = Math.min(startIndex + pageSize, films.length);
      const filmsPage = films.slice(startIndex, endIndex);

      const nextCursor: number | null =
        endIndex < films.length ? endIndex : null;

      return Promise.resolve({
        data: {
          films: filmsPage,
          nextCursor,
        },
      });
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 5,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: true,
        excludeDVD: false,
        excludeProjector: false,
        search: {
          director: "Christopher Nolan",
        },
        nextPageKey: null,
      }),
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);

    expect(responseBody.films).toEqual([
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
      {
        title: "Interstellar",
        releaseYear: 2014,
        numberOfCopiesAvailable: 2,
        director: "Christopher Nolan",
        distributor: "Paramount",
      },
      {
        title: "The Dark Knight",
        releaseYear: 2008,
        numberOfCopiesAvailable: 4,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
    ]);

    expect(responseBody.nextPageKey).toBeNull();
  });

  it("should correctly sum numberOfCopiesAvailable when duplicates exist", async () => {
    const dvdData: Film[] = [
      {
        title: "Shared Movie",
        releaseYear: 2000,
        numberOfCopiesAvailable: 2,
        director: "Director X",
        distributor: "Distributor X",
      },
    ];

    const projectorData: Film[] = [
      {
        title: "Shared Movie",
        releaseYear: 2000,
        numberOfCopiesAvailable: 3,
        director: "Director X",
        distributor: "Distributor X",
      },
    ];

    mockedAxios.post.mockImplementation((url, data?: any) => {
      const body = data as any;
      const cursor: number = body.cursor ?? 0;
      const pageSize = body.pageSize || 10;

      let films: Film[] = [];

      if (url.includes("dvd")) {
        films = dvdData;
      } else if (url.includes("projector")) {
        films = projectorData;
      } else {
        films = [];
      }

      const startIndex = cursor;
      const endIndex = Math.min(startIndex + pageSize, films.length);
      const filmsPage = films.slice(startIndex, endIndex);

      const nextCursor: number | null =
        endIndex < films.length ? endIndex : null;

      return Promise.resolve({
        data: {
          films: filmsPage,
          nextCursor,
        },
      });
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 5,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: true,
        excludeDVD: false,
        excludeProjector: false,
        search: {},
        nextPageKey: null,
      }),
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);

    expect(responseBody.films).toEqual([
      {
        title: "Shared Movie",
        releaseYear: 2000,
        numberOfCopiesAvailable: 5,
        director: "Director X",
        distributor: "Distributor X",
      },
    ]);

    expect(responseBody.nextPageKey).toBeNull();
  });

  it("should handle downstream service errors gracefully", async () => {
    mockedAxios.post.mockImplementation((url, data?: any) => {
      if (url.includes("vhs")) {
        return Promise.reject(new Error("VHS Service Unavailable"));
      } else if (url.includes("dvd")) {
        return Promise.resolve({
          data: {
            films: [
              {
                title: "Inception",
                releaseYear: 2010,
                numberOfCopiesAvailable: 5,
                director: "Christopher Nolan",
                distributor: "Warner Bros",
              },
            ],
            nextCursor: null,
          },
        });
      } else {
        return Promise.resolve({ data: { films: [], nextCursor: null } });
      }
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 5,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: false,
        excludeDVD: false,
        excludeProjector: false,
        search: {},
        nextPageKey: null,
      }),
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);

    expect(responseBody.films).toEqual([
      {
        title: "Inception",
        releaseYear: 2010,
        numberOfCopiesAvailable: 5,
        director: "Christopher Nolan",
        distributor: "Warner Bros",
      },
    ]);

    expect(responseBody.nextPageKey).toBeNull();
  });

  it("should return empty results when no films match the search criteria", async () => {
    mockedAxios.post.mockImplementation((url, data?: any) => {
      return Promise.resolve({ data: { films: [], nextCursor: null } });
    });

    const event: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 5,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: false,
        excludeDVD: false,
        excludeProjector: false,
        search: {
          title: "Nonexistent Movie",
        },
        nextPageKey: null,
      }),
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);

    expect(responseBody.films).toEqual([]);
    expect(responseBody.nextPageKey).toBeNull();
  });

  it("should return an error when request body is missing", async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
    } as any;

    const result = (await searchFilms(
      event,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result.statusCode).toBe(500);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe("Internal server error");
  });

  it("should correctly provide the nextPageKey for pagination", async () => {
    const vhsData: Film[] = [
      {
        title: "Movie A",
        releaseYear: 2000,
        numberOfCopiesAvailable: 1,
        director: "Director A",
        distributor: "Distributor A",
      },
      {
        title: "Movie B",
        releaseYear: 2001,
        numberOfCopiesAvailable: 1,
        director: "Director B",
        distributor: "Distributor B",
      },
    ];

    const dvdData: Film[] = [
      {
        title: "Movie C",
        releaseYear: 2002,
        numberOfCopiesAvailable: 1,
        director: "Director C",
        distributor: "Distributor C",
      },
      {
        title: "Movie D",
        releaseYear: 2003,
        numberOfCopiesAvailable: 1,
        director: "Director D",
        distributor: "Distributor D",
      },
    ];

    mockedAxios.post.mockImplementation((url, data?: any) => {
      const body = data as any;
      const sortField = body.sortField;
      const sortDirection = body.sortDirection;
      const cursor: number = body.cursor ?? 0;
      const pageSize = body.pageSize || 10;

      let films: Film[] = [];

      if (url.includes("vhs")) {
        films = vhsData;
      } else if (url.includes("dvd")) {
        films = dvdData;
      }

      films.sort((a, b) => {
        let result = 0;
        if (sortField === "title") {
          result = a.title.localeCompare(b.title);
        } else {
          result = a.releaseYear - b.releaseYear;
        }
        return sortDirection === "ASC" ? result : -result;
      });

      const startIndex = cursor;
      const endIndex = Math.min(startIndex + pageSize, films.length);
      const filmsPage = films.slice(startIndex, endIndex);

      const nextCursor: number | null =
        endIndex < films.length ? endIndex : null;

      return Promise.resolve({
        data: {
          films: filmsPage,
          nextCursor,
        },
      });
    });

    // First request
    const event1: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 3,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: false,
        excludeDVD: false,
        excludeProjector: true,
        search: {},
        nextPageKey: null,
      }),
    } as any;

    const result1 = (await searchFilms(
      event1,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result1.statusCode).toBe(200);

    const responseBody1 = JSON.parse(result1.body);

    expect(responseBody1.films.length).toBe(3);
    expect(responseBody1.nextPageKey).toBeDefined();

    const event2: APIGatewayProxyEvent = {
      body: JSON.stringify({
        pageSize: 3,
        sortField: "title",
        sortDirection: "ASC",
        excludeVHS: false,
        excludeDVD: false,
        excludeProjector: true,
        search: {},
        nextPageKey: responseBody1.nextPageKey,
      }),
    } as any;

    const result2 = (await searchFilms(
      event2,
      context,
      callback
    )) as APIGatewayProxyResult;

    expect(result2.statusCode).toBe(200);

    const responseBody2 = JSON.parse(result2.body);

    expect(responseBody2.nextPageKey).toBeNull();
  });
});

function applySearchFilters(films: Film[], search: any): Film[] {
  return films.filter((film) => {
    let matches = true;
    if (search.title) {
      matches =
        matches &&
        film.title.toLowerCase().includes(search.title.toLowerCase());
    }
    if (search.releaseYear) {
      matches = matches && film.releaseYear === search.releaseYear;
    }
    if (search.director) {
      matches =
        matches &&
        film.director.toLowerCase().includes(search.director.toLowerCase());
    }
    if (search.distributor) {
      matches =
        matches &&
        film.distributor
          .toLowerCase()
          .includes(search.distributor.toLowerCase());
    }
    return matches;
  });
}
