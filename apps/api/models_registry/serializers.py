from rest_framework import serializers

from .models import ModelVersion


class ModelVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelVersion
        fields = (
            "version_string",
            "release_notes",
            "tfjs_manifest_url",
            "baselines_url",
            "weights_sha256",
            "input_size",
            "embedding_dim",
            "margin",
            "published_at",
        )
        read_only_fields = fields
