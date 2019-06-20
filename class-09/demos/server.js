// This demo file contains snippets of code that directly update or replace code from day 8's demo
// This is not a working server.js
// This highlights the pieces of code that change regarding the weather route

// To make the code more dry, we separate out the lookup functionality
// Either during code review or the start of demo,
// point out the similarities between the location and weather lookup functions
// Let the students navigate making this code DRY
function lookup(options) {
  const SQL = `SELECT * FROM ${options.tableName} WHERE location_id=$1;`;
  const values = [options.location];

  client.query(SQL, values)
    .then(result => {
      if (result.rowCount > 0) {
        options.cacheHit(result);
      } else {
        options.cacheMiss();
      }
    })
    .catch(error => handleError(error));
}

// First, build this function specific to weather, then talk about abstracting it for all routes
// Clear the results for a location if they are stale
function deleteByLocationId(table, city) {
  const SQL = `DELETE from ${table} WHERE location_id=${city};`;
  return client.query(SQL);
}

// Date.now() returns the time in milliseconds since January 1, 1970 00:00:00 UTC.
// Multiplying by 1000 converts the time from seconds to milliseconds
// Mention that they will need additional calculations to convert the difference to hours, days, months, minutes etc.
// We have the students perform a 15 second cache invalidation for weather so the ta's can check it quickly
// Note: the Dark Sky api has a limit of 1000 hits per day
const timeouts = {
  weather: 15 * 1000
};

// Each model will need a way to track when the record was added to the database
// Add this.created_at property to use for cache invalidation
// This can also be accomplished with a timestamp in SQL
function Weather(day) {
  this.tableName = 'weathers';
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;
// All models can share the dynamic deleteByLocationId function
Weather.deleteByLocationId = deleteByLocationId;

// Add this.created_at to the INSERT statement
// Students will also need to update and run their schema.sql to include this new property
// Remind students to drop the tables and re-create them when modifying the schema or statements
Weather.prototype = {
  save: function (location_id) {
    const SQL = `INSERT INTO ${this.tableName} (forecast, time, created_at, location_id) VALUES ($1, $2, $3);`;
    const values = [this.forecast, this.time, this.created_at, location_id];

    client.query(SQL, values);
  }
};

function getWeather(request, response) {
  Weather.lookup({
    tableName: Weather.tableName,

    location: request.query.data.id,

    // Update the cacheHit method to check the creation time and determine if the records should be used or replaced with more recent API results
    cacheHit: function (result) {
      // Date.now() returns the time in milliseconds since January 1, 1970 00:00:00 UTC.
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if (ageOfResults > timeouts.weather) {
        // Clear the records for just this query, using the function from above
        Weather.deleteByLocationId(Weather.tableName, request.query.data.id);
        // Request fresh data from the API
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },

    cacheMiss: function () {
      const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;

      superagent.get(url)
        .then(result => {
          const weatherSummaries = result.body.daily.data.map(day => {
            const summary = new Weather(day);
            summary.save(request.query.data.id);
            return summary;
          });
          response.send(weatherSummaries);
        })
        .catch(error => handleError(error, response));
    }
  });
}
