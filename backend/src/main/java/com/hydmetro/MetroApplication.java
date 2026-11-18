package com.hydmetro;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Spring Boot entry point. Run with {@code ./gradlew bootRun}. The API is served at http://localhost:8080. */
@SpringBootApplication
public class MetroApplication {
    public static void main(String[] args) {
        SpringApplication.run(MetroApplication.class, args);
    }
}
