const jsonServer = require("json-server");
const path = require("path");
const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, "db.json"));
const middlewares = jsonServer.defaults();
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const _get = require("lodash/get");
const _orderBy = require("lodash/orderBy");
const _lowerCase = require("lodash/lowerCase");
const jwt = require("jsonwebtoken");
const _groupBy = require("lodash/groupBy");

const adapter = new FileSync(path.join(__dirname, "db.json"));
const db = low(adapter);

const MAX_SIZE_RECOMMENDATION = 6;

server.use(middlewares);
server.use(jsonServer.bodyParser);

server.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = db
    .get("users")
    .find({
      email,
      password,
    })
    .value();

  if (user) {
    const token = jwt.sign(user, "shhhhh");
    return res.status(200).jsonp({
      data: {
        ...user,
        token,
      },
    });
  }

  return res.status(401).jsonp({
    error_message: "Your credentials is invalid",
  });
});

server.get("/search", (req, res) => {
  const { q } = req.query;
  const movies = db
    .get("movies")
    .find((movie) => {
      return _lowerCase(movie.name).indexOf(_lowerCase(q)) >= 0;
    })
    .values();

  return res.status(200).jsonp({
    data: movies,
  });
});

server.get("/movies", (req, res) => {
  let movies = db.get("movies").value();
  movies = movies.map((movie) => {
    movie.result_genres = db
      .get("genres")
      .filter((genre) => {
        return movie.genres && movie.genres.includes(genre.id);
      })
      .value();

    return movie;
  });
  return res.status(200).jsonp({
    data: movies,
  });
});

server.get("/my-recommendation", (req, res) => {
  const tokenBearer = _get(req.headers, "authorization", "");
  const token = _get(tokenBearer.split(" "), "[1]", "");

  const user = jwt.decode(token);
  const userId = _get(user, "id", "");

  let userActivity = db
    .get("user_activity")
    .filter({
      user_id: userId,
    })
    .value();

  const results = _orderBy(userActivity, ["date"], ["desc"]).slice(0, 5);
  const movieIds = results.reduce((array, x, i) => {
    array.push(x.movie_id);
    return array;
  }, []);

  const moviesWhereIn = db
    .get("movies")
    .filter((x) => {
      return movieIds.includes(x.id);
    })
    .value();

  const castsIds = moviesWhereIn.reduce((array, x) => {
    return [...array, ...x.casts];
  }, []);
  const genresIds = moviesWhereIn.reduce((array, x) => {
    return [...array, ...x.genres];
  }, []);

  const movies = db.get("movies").value();

  const response = movies.map((x) => {
    let priority = 0;
    x.genres.map((g) => {
      if (genresIds.includes(g)) {
        priority += 1;
      }
    });

    x.casts.map((c) => {
      if (castsIds.includes(c)) {
        priority += 1;
      }
    });

    x.result_genres = db
      .get("genres")
      .filter((genre) => {
        return x.genres.includes(genre.id);
      })
      .value();

    x.priority = priority;
    return x;
  });

  const rest = [...response];
  return res.status(200).jsonp({
    data: _orderBy(rest, ["priority"], ["desc"]).slice(0, MAX_SIZE_RECOMMENDATION),
  });
});

server.get("/movies/:movie_id", (req, res) => {
  const { movie_id } = req.params;
  const movie = db
    .get("movies")
    .find({
      id: parseInt(movie_id),
    })
    .value();

  let casts = [];
  let genres = [];

  if (movie) {
    casts = db
      .get("casts")
      .filter((cast) => {
        return movie.casts && movie.casts.includes(cast.id);
      })
      .value();

    genres = db
      .get("genres")
      .filter((genre) => {
        return movie.genres && movie.genres.includes(genre.id);
      })
      .value();
  }

  return res.status(200).jsonp({
    data: {
      ...movie,
      casts,
      genres,
    },
  });
});

server.get("/movies/:movie_id/track", (req, res) => {
  const { movie_id: movieId } = req.params;
  const tokenBearer = _get(req.headers, "authorization", "");
  const token = _get(tokenBearer.split(" "), "[1]", "");

  const user = jwt.decode(token);
  const userId = _get(user, "id", "");

  db.get("user_activity")
    .push({
      user_id: Number(userId),
      movie_id: Number(movieId),
      date: Date.now(),
    })
    .write();

  res.send("OK");
});

server.get("/movies/:movie_id/recommendation", (req, res) => {
  const { movie_id } = req.params;
  const movie = db
    .get("movies")
    .find({
      id: Number(movie_id),
    })
    .value();

  const genres = _get(movie, "genres", []);
  const casts = _get(movie, "casts", []);

  const moviesRecommendtion = db
    .get("movies")
    .filter((x) => {
      return (
        x.id !== Number(movie_id) &&
        x.genres &&
        x.casts &&
        (x.genres.find((g) => genres.includes(g)) || x.casts.find((c) => casts.includes(c)))
      );
    })
    .value();

  const results = moviesRecommendtion.map((x) => {
    let priority = 0;
    x.genres.map((g) => {
      if (genres.includes(g)) {
        priority += 1;
      }
    });

    x.casts.map((c) => {
      if (casts.includes(c)) {
        priority += 1;
      }
    });

    x.result_genres = db
      .get("genres")
      .filter((genre) => {
        return x.genres.includes(genre.id);
      })
      .value();

    x.priority = priority;
    return x;
  });

  // Only get 3 items of movie recommendation
  const rest = [...results];
  return res.status(200).jsonp({
    data: _orderBy(rest, ["priority"], ["desc"]).slice(0, MAX_SIZE_RECOMMENDATION),
  });
});

router.render = (req, res) => {
  res.jsonp({
    data: res.locals.data,
  });
};

server.use(router);
server.listen(3004, () => {
  console.log("JSON Server is running in port 3004");
});
