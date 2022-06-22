require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/qa/questions', (req, res, next) => {
  let count;
  let page;
  if (req.query.count) {
    count = req.query.count;
  } else {
    count = 5;
  }
  if (req.query.page) {
    page = (req.query.page - 1) * count;
  } else {
    page = 0;
  }
  db.query(
    `
    SELECT
      questions.product_id,
      questions.id AS question_id,
      questions.body AS question_body,
      questions.date_written AS question_date,
      questions.asker_name,
      questions.helpful AS question_helpfulness,
      questions.reported,
      answers.id,
      answers.body,
      answers.date_written AS date,
      answers.answerer_name,
      answers.helpful AS helpfulness,
      answers_photos.id AS photo_id,
      answers_photos.url
    FROM (
      SELECT
        *
      FROM
        questions
      WHERE
        product_id = $1
        AND reported = FALSE
      ORDER BY
        id ASC
      LIMIT $2 OFFSET $3) questions
      LEFT JOIN (
        SELECT
          *
        FROM
          answers
        WHERE
          reported = FALSE) answers ON questions.id = answers.question_id
      LEFT JOIN answers_photos ON answers.id = answers_photos.answer_id
    ORDER BY
      questions.id ASC
    `,
    [req.query.product_id, count, page],
    (err, result) => {
      if (err) {
        return next(err);
      }
      const questions = [];
      let previous = null;
      for (let i = 0; i < result.rows.length; i++) {
        const {
          question_id,
          question_body,
          question_date,
          asker_name,
          question_helpfulness,
          reported,
          id,
          body,
          date,
          answerer_name,
          helpfulness,
          photo_id,
          url,
        } = result.rows[i];
        if (question_id !== previous) {
          questions.push({
            question_id,
            question_body,
            question_date,
            asker_name,
            question_helpfulness,
            reported,
            answers: {},
          });
        }
        previous = question_id;
        if (id) {
          if (!questions[questions.length - 1].answers.hasOwnProperty(id)) {
            questions[questions.length - 1].answers[id] = {
              id,
              body,
              date,
              answerer_name,
              helpfulness,
              photos: [],
            };
          }
          if (photo_id) {
            questions[questions.length - 1].answers[id].photos.push(url);
          }
        }
      }
      res
        .status(200)
        .send({ product_id: req.query.product_id, results: questions });
      return null;
    }
  );
});

app.get('/qa/questions/:question_id/answers', (req, res, next) => {
  db.query(
    `
    SELECT
      id AS answer_id,
      body,
      date_written AS date,
      answerer_name,
      helpful AS helpfulness
    FROM
      answers
    WHERE
      question_id = $1
      AND reported = FALSE
    ORDER BY
      date_written
    LIMIT $2
    OFFSET ($3 - 1) * 100
    `,
    [req.params.question_id, (req.query.count = 5), (req.query.page = 1)],
    (err, result) => {
      if (err) {
        return next(err);
      }
      const data = {
        question: req.params.question_id,
        page: req.query.page,
        count: req.query.count,
        results: result.rows,
      };
      res.status(200).send(data);
      return null;
    }
  );
});

app.post('/qa/questions', (req, res, next) => {
  const { product_id, body, name, email } = req.body;
  db.query(
    `
    INSERT INTO questions (product_id, body, asker_name, asker_email)
      VALUES ($1, $2, $3, $4)
    `,
    [product_id, body, name, email],
    (err, result) => {
      if (err) {
        return next(err);
      }
      res.status(201).send('Created');
      return null;
    }
  );
});

app.post('/qa/questions/:question_id/answers', (req, res, next) => {
  const { question_id } = req.params;
  const { body, name, email, photos } = req.body;
  db.query(
    `
    WITH inserted AS (
      INSERT INTO answers (question_id, body, answerer_name, answerer_email)
          VALUES ($1, $2, $3, $4)
        RETURNING
          id)
        INSERT INTO answers_photos (answer_id, url)
        SELECT
          *
        FROM (
          SELECT
            id AS answer_id
          FROM
            inserted) inserted
        CROSS JOIN unnest($5::text[]) url
    `,
    [question_id, body, name, email, photos],
    (err, result) => {
      if (err) {
        return next(err);
      }
      res.status(201).send('Created');
      return null;
    }
  );
});

app.put('/qa/questions/:question_id/helpful', (req, res, next) => {
  const { question_id } = req.params;
  db.query(
    `
    UPDATE
      questions
    SET
      helpful = helpful + 1
    WHERE
      id = $1
    `,
    [question_id],
    (err, result) => {
      if (err) {
        return next(err);
      }
      res.status(204).send('Updated');
      return null;
    }
  );
});

app.put('/qa/questions/:question_id/report', (req, res, next) => {
  const { question_id } = req.params;
  db.query(
    `
    UPDATE
      questions
    SET
      reported = true
    WHERE
      id = $1
    `,
    [question_id],
    (err, result) => {
      if (err) {
        return next(err);
      }
      res.status(204).send('Updated');
      return null;
    }
  );
});

app.put('/qa/answers/:answer_id/helpful', (req, res, next) => {
  const { answer_id } = req.params;
  db.query(
    `
    UPDATE
      answers
    SET
      helpful = helpful + 1
    WHERE
      id = $1
    `,
    [answer_id],
    (err, result) => {
      if (err) {
        return next(err);
      }
      res.status(204).send('Updated');
      return null;
    }
  );
});

app.put('/qa/answers/:answer_id/report', (req, res, next) => {
  const { answer_id } = req.params;
  db.query(
    `
    UPDATE
      answers
    SET
      reported = true
    WHERE
      id = $1
    `,
    [answer_id],
    (err, result) => {
      if (err) {
        return next(err);
      }
      res.status(204).send('Updated');
      return null;
    }
  );
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
