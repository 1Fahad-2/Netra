#ifndef TRINETRA_PREPROCESSING_H
#define TRINETRA_PREPROCESSING_H

#define TRINETRA_NUM_FEATURES 3
#define TRINETRA_NUM_CLASSES 3

const char* const trinetra_labels[TRINETRA_NUM_CLASSES] = {
    "caution",
    "critical",
    "safe"
};

const float trinetra_feature_mean[TRINETRA_NUM_FEATURES] = {
    0.6473181797f,  // distance_m
    0.0212045456f,  // closing_speed_mps
    1.8599898929f  // ttc_s
};

const float trinetra_feature_std[TRINETRA_NUM_FEATURES] = {
    0.6473871390f,  // distance_m
    0.9211126592f,  // closing_speed_mps
    6.8001028069f  // ttc_s
};

#endif
