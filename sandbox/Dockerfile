FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY manage.py ./
COPY twin ./twin
COPY portal ./portal
COPY fixed.patch ./
# BUILD=fixed applies the fixes the owner approved earlier; BUILD=broken keeps the planted faults.
ARG BUILD=broken
RUN if [ "$BUILD" = "fixed" ]; then apt-get update && apt-get install -y --no-install-recommends patch && patch -p1 < fixed.patch && rm -rf /var/lib/apt/lists/*; fi
ENV JR_BUILD=$BUILD DJANGO_SETTINGS_MODULE=twin.settings
EXPOSE 8000
USER nobody
CMD ["gunicorn", "twin.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "20"]
