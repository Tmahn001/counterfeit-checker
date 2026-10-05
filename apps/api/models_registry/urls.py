from django.urls import path

from . import views

urlpatterns = [
    path("latest/", views.LatestModelView.as_view(), name="models-latest"),
    path("", views.ModelVersionListView.as_view(), name="models-list"),
]
