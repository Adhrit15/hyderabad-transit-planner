package com.hydmetro.model;

/** A metro line, e.g. RED "Red Line" #e53935. Immutable value object (a Java record). */
public record Line(String id, String name, String color) {
}
