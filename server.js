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
        return movie.genres.includes(genre.id);
      })
      .value();

    return movie;
  });
  return res.status(200).jsonp({
    data: movies,
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
        return movie.casts.includes(cast.id);
      })
      .value();

    genres = db
      .get("genres")
      .filter((genre) => {
        return movie.genres.includes(genre.id);
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
