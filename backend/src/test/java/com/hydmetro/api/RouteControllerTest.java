package com.hydmetro.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class RouteControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void listsStations() throws Exception {
        mvc.perform(get("/api/stations")).andExpect(status().isOk())
                .andExpect(jsonPath("$.stations", hasSize(56)))
                .andExpect(jsonPath("$.lines", hasSize(3)));
    }

    @Test
    void routeMiyapurToLbNagar() throws Exception {
        mvc.perform(get("/api/route").param("from", "miyapur").param("to", "lb-nagar").param("mode", "astar"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true))
                .andExpect(jsonPath("$.transfers").value(0))
                .andExpect(jsonPath("$.legs", hasSize(1)))
                .andExpect(jsonPath("$.legs[0].towards").value("LB Nagar"))
                .andExpect(jsonPath("$.fare").value(69))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void routeRaidurgToMgbsWithTraceAndTransfer() throws Exception {
        mvc.perform(get("/api/route").param("from", "raidurg").param("to", "mg-bus-station").param("trace", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transfers").value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.instructions[*]", hasItem(startsWith("Change at"))))
                .andExpect(jsonPath("$.trace", not(empty())));
    }

    @Test
    void paretoReturnsAlternatives() throws Exception {
        mvc.perform(get("/api/route").param("from", "raidurg").param("to", "mg-bus-station").param("mode", "pareto"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found").value(true));
    }

    @Test
    void compareReturnsAllModes() throws Exception {
        mvc.perform(get("/api/compare").param("from", "raidurg").param("to", "lb-nagar"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results", hasSize(5)))
                .andExpect(jsonPath("$.results[0].mode").value("fastest"));
    }

    @Test
    void unknownStationIs404() throws Exception {
        mvc.perform(get("/api/route").param("from", "miyapur").param("to", "atlantis"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Station not found"));
    }

    @Test
    void badModeIs400() throws Exception {
        mvc.perform(get("/api/route").param("from", "miyapur").param("to", "lb-nagar").param("mode", "teleport"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void missingParamIs400() throws Exception {
        mvc.perform(get("/api/route").param("from", "miyapur")).andExpect(status().isBadRequest());
    }

    @Test
    void malformedIdIs400() throws Exception {
        mvc.perform(get("/api/route").param("from", "<script>").param("to", "lb-nagar")).andExpect(status().isBadRequest());
    }

    @Test
    void openApiDocsAreServed() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("$.paths['/api/route']").exists());
    }
}
