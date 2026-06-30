# Add this to your main project urls.py

from django.urls import path, include

urlpatterns = [
    # your existing urls here...

    path("pharmacy/", include("pharmacy.urls")),
]
