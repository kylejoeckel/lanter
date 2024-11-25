# README

## Overview

This project is an API proxy/middleware for video search, developed as a code assessment submission. The main objective is to aggregate film data from multiple services (VHS, DVD, and Projector), respect search parameters, minimize request times, and avoid duplicate results.

## Functionality

The `searchFilms` function serves as the core of the service. It:

- Accepts search requests from the UI.
- Determines which downstream services to query based on exclusion flags (`excludeVHS`, `excludeDVD`, `excludeProjector`).
- Sends concurrent search requests to the selected services.
- Aggregates and deduplicates results.
- Sorts the combined list according to specified criteria (`sortField`, `sortDirection`).
- Implements cursor-based pagination using `nextPageKey`.
- Returns a paginated response with films and `nextPageKey` if more data is available.

## Design Decisions

### Pagination Strategy

- **Cursor-Based Pagination**: Implemented using a `nextPageKey` to ensure statelessness, which is crucial for scalability and compatibility with load balancers that do not support session stickiness.
- **Cursors per Service**: Maintains individual cursors for each downstream service to track the position in their respective datasets.
- **Efficient Data Retrieval**: Fetches only the necessary data from each service based on the `pageSize`, reducing network overhead and improving response times.

### Aggregation and Deduplication

- **Film Identification**: Films are considered duplicates if they have the same `title` and `releaseYear`.
- **Merging Logic**: Duplicate films from different services are merged into a single record, summing their `numberOfCopiesAvailable`.
- **Consistent Sorting**: Merged results are sorted according to the client's specified `sortField` and `sortDirection`, ensuring that pagination across services remains consistent.

### Error Handling

- **Resilience**: The service gracefully handles errors from any downstream service by excluding the failed service's data without failing the entire request.
- **Logging**: Errors are logged for debugging purposes without exposing internal details to the client.
- **Client Transparency**: The client receives the best possible results from available services, along with a `nextPageKey` that excludes failed services.

### Search Parameters

- **Direct Forwarding**: All search parameters provided by the client are directly forwarded to the downstream services, ensuring accurate filtering at the source.
- **Parameter Support**: Supports filtering by `title`, `releaseYear`, `director`, and `distributor`.

## Running Tests

The project includes comprehensive unit tests using Jest to verify functionality, including aggregation, deduplication, pagination, search parameters, and error handling.

### How to Run Tests

1. **Install Dependencies**:

   Ensure you have all necessary dependencies installed:

   ```bash
   npm install
   ```

2. **Run Tests**:

   Execute the test suite using the following command:

   ```bash
   npm test
   ```

   You should see output indicating all tests have passed:

   ```
   PASS  tests/handler.test.ts
     searchFilms
       ✓ should return aggregated and deduplicated results with correct sorting and provide nextPageKey
       ✓ should handle exclusion of VHS and aggregate results correctly
       ✓ should correctly handle search parameters
       ✓ should correctly sum numberOfCopiesAvailable when duplicates exist
       ✓ should handle downstream service errors gracefully
       ✓ should return empty results when no films match the search criteria
       ✓ should return an error when request body is missing
       ✓ should correctly provide the nextPageKey for pagination

   Test Suites: 1 passed, 1 total
   Tests:       8 passed, 8 total
   ```

### Test Coverage

- **Aggregation and Deduplication**: Ensures that results from multiple services are correctly merged and duplicates are handled appropriately.
- **Pagination and Cursor Management**: Verifies that pagination works correctly with `nextPageKey`, and that cursors for each service are managed properly.
- **Search Parameters**: Confirms that search parameters are respected and correctly applied to the results.
- **Error Handling**: Tests that the service handles downstream service failures gracefully without failing the entire request.
- **Exclusion Flags**: Checks that services are correctly excluded based on the provided exclusion flags.

