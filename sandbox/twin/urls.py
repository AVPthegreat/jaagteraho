from django.urls import path

from portal import views

urlpatterns = [
    path("", views.index),
    path("api/submit", views.submit_code),
    path("api/exam/start", views.start_exam),
    path("api/pay", views.pay_fee),
    path("health", views.health),
]
