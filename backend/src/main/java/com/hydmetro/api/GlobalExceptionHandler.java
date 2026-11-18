package com.hydmetro.api;

import com.hydmetro.model.Graph;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Maps exceptions to RFC 7807 "problem+json" responses, so every error has the same shape:
 * {@code {"type","title","status","detail"}}.
 * 400 = the client sent something malformed. 404 = a well-formed station id that does not exist.
 * 500 = a bug on our side.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Graph.UnknownStationException.class)
    ProblemDetail unknownStation(Graph.UnknownStationException e) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
        p.setTitle("Station not found");
        p.setProperty("station", e.stationId());
        return p;
    }

    @ExceptionHandler({IllegalArgumentException.class, ConstraintViolationException.class,
            MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class,
            HandlerMethodValidationException.class})
    ProblemDetail badRequest(Exception e) {
        String detail = e.getMessage();
        if (e instanceof HandlerMethodValidationException h) {
            detail = h.getAllErrors().stream().map(err -> err.getDefaultMessage()).reduce((a, b) -> a + "; " + b).orElse(detail);
        }
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
        p.setTitle("Invalid request");
        return p;
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception e) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error");
        p.setTitle("Internal error");
        return p;
    }
}
