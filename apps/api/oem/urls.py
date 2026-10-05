from django.urls import path

from . import views

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="oem-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="oem-logout"),
    path("auth/me/", views.MeView.as_view(), name="oem-me"),
    path("baselines/", views.BaselineListCreateView.as_view(), name="oem-baselines"),
    path("baselines/<uuid:pk>/", views.BaselineDetailView.as_view(), name="oem-baseline-detail"),
]
